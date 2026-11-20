import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync, constants, fsyncSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync,
  statSync, unlinkSync, writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { constants as os } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { absolute, array, canonical, identifier, onlyKeys, Rejection, ResourceBusy, string } from "./input.js";

type Operation = { command: string; args: string[] };
type Outcome = {
  state: "exited" | "signalled" | "timed-out" | "interrupted" | "launch-failed" | "unavailable";
  exitCode: number | null;
  signal: NodeJS.Signals | null;
};
type Observed = Outcome & { descendantsObserved: boolean; processGroupClean: boolean };

const safeEnv = { PATH: "/usr/bin:/bin", LC_ALL: "C" };
const noSignal = new AbortController().signal;

function operation(value: unknown, label: string): Operation {
  const [first, ...rest] = array(value, label);
  const args = rest.map((item) => item === "" ? "" : string(item, `${label} argument`));
  return { command: absolute(first, `${label} executable`), args };
}

function timeout(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 21_600_000) {
    throw new Error(`Invalid ${label} in milliseconds`);
  }
  return value;
}

function missing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function groupAlive(group: number): boolean {
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/u.test(name)) continue;
    let stat: string;
    try {
      stat = readFileSync(`/proc/${name}/stat`, "utf8");
    } catch (error) {
      if (missing(error) || (error && typeof error === "object" && "code" in error && error.code === "ESRCH")) continue;
      throw new Error("Cannot verify the process group");
    }
    const [state, , pgid] = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    if (pgid === String(group) && state !== "Z" && state !== "X") return true;
  }
  return false;
}

async function stopGroup(group: number): Promise<boolean> {
  for (const signal of ["SIGTERM", "SIGKILL"] as const) {
    if (!groupAlive(group)) return true;
    try {
      process.kill(-group, signal);
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "ESRCH")) return false;
    }
    for (let i = 0; i < 20; i += 1) {
      if (!groupAlive(group)) return true;
      await delay(25);
    }
  }
  return !groupAlive(group);
}

async function execute(
  { command, args }: Operation, cwd: string, limit: number, stop: AbortSignal,
): Promise<Observed> {
  if (stop.aborted) {
    return { state: "interrupted", exitCode: null, signal: null, descendantsObserved: false, processGroupClean: true };
  }
  const child = spawn(command, args, { cwd, detached: true, stdio: "ignore", env: safeEnv });
  const finished = new Promise<Outcome>((resolve) => {
    child.once("error", () => resolve({ state: "launch-failed", exitCode: null, signal: null }));
    child.once("exit", (exitCode, signal) => resolve({ state: signal ? "signalled" : "exited", exitCode, signal }));
  });
  const limitSignal = AbortSignal.timeout(limit);
  const interruption = AbortSignal.any([stop, limitSignal]);
  let interrupt!: () => void;
  const interrupted = new Promise<Outcome>((resolve) => {
    interrupt = () => resolve({ state: stop.aborted ? "interrupted" : "timed-out", exitCode: null, signal: null });
    interruption.addEventListener("abort", interrupt, { once: true });
    if (interruption.aborted) interrupt();
  });
  const outcome = await Promise.race([finished, interrupted]);
  interruption.removeEventListener("abort", interrupt);
  const group = child.pid;
  const descendantsObserved = Boolean(group && (outcome.state === "exited" || outcome.state === "signalled") && groupAlive(group));
  const processGroupClean = !group || await stopGroup(group);
  if (!processGroupClean) child.unref();
  return { ...outcome, descendantsObserved, processGroupClean };
}

function syncDirectory(path: string) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function commandStatus(outcome: Outcome) {
  switch (outcome.state) {
    case "exited": return outcome.exitCode ?? 2;
    case "signalled": return 128 + (outcome.signal ? os.signals[outcome.signal] : 0);
    case "interrupted": return 130;
    case "timed-out": return 124;
    default: return 2;
  }
}

function acquired(lock: number) {
  const result = spawnSync("flock", ["--exclusive", "--nonblock", "--conflict-exit-code", "75", "3"], {
    stdio: ["ignore", "ignore", "ignore", lock], env: safeEnv, timeout: 5_000,
  });
  if (result.status === 75) throw new ResourceBusy("Mutable resource is locked by another runner");
  if (result.error || result.status !== 0) throw new Error("Cannot acquire the mutable-resource lock");
}

export async function runControl(input: Record<string, unknown>, reconcile: boolean, stop: AbortSignal) {
  if (process.platform !== "linux") throw new Error("The resource runner requires Linux and util-linux flock");
  onlyKeys(input, ["cwd", "lockDir", "resource", "result", "timeoutMs", "cleanupTimeoutMs", "command", "cleanup", "reconcile"]);
  const cwd = canonical(input.cwd, "runner working directory");
  const lockDir = canonical(input.lockDir, "lock directory");
  if (!statSync(lockDir).isDirectory() || (statSync(lockDir).mode & 0o002)) {
    throw new Error("The lock directory must be provisioned and protected from untrusted writers");
  }
  const resource = identifier(input.resource, "mutable resource identity");
  const key = createHash("sha256").update(resource).digest("hex");
  const dirtyPath = join(lockDir, `${key}.dirty`);
  const resultPath = absolute(input.result, "result path");
  const resultDir = canonical(dirname(resultPath), "result directory");
  const resultLocation = relative(lockDir, resultDir);
  if (!isAbsolute(resultLocation) && resultLocation !== ".." && !resultLocation.startsWith(`..${sep}`)) {
    throw new Error("Keep the result outside the lock directory");
  }
  const recovery = input.reconcile === undefined ? undefined : operation(input.reconcile, "reconciliation command");
  const command = reconcile ? undefined : operation(input.command, "check command");
  const cleanup = reconcile ? recovery : operation(input.cleanup, "cleanup command");
  if (!cleanup) throw new Error("Expected a reconciliation command");
  const time = timeout(input.timeoutMs, "check time limit");
  const cleanupTime = timeout(input.cleanupTimeoutMs, "cleanup time limit");
  const lock = openSync(join(lockDir, `${key}.lock`), constants.O_NOFOLLOW | constants.O_CREAT | constants.O_RDWR, 0o600);
  try {
    const lockStat = fstatSync(lock);
    if (!lockStat.isFile() || lockStat.nlink !== 1) throw new Error("Invalid mutable-resource lock file");
    acquired(lock);
    let dirty = false;
    try {
      lstatSync(dirtyPath);
      dirty = true;
    } catch (error) {
      if (!missing(error)) throw error;
    }
    if (dirty && !reconcile) throw new Rejection("Prior mutable-resource run requires reconciliation");
    if (!dirty && reconcile) throw new Rejection("Mutable resource does not require reconciliation");
    const result = openSync(resultPath, "wx", 0o600);
    try {
      if (!dirty) {
        closeSync(openSync(dirtyPath, "wx", 0o600));
        syncDirectory(lockDir);
      }
      let primary: Observed | undefined;
      let followup: Observed;
      try {
        primary = command && await execute(command, cwd, time, stop);
      } catch {
        primary = { state: "unavailable", exitCode: null, signal: null, descendantsObserved: false, processGroupClean: false };
      } finally {
        try {
          followup = await execute(cleanup, cwd, cleanupTime, noSignal);
        } catch {
          followup = { state: "unavailable", exitCode: null, signal: null, descendantsObserved: false, processGroupClean: false };
        }
      }
      const clean = (primary?.processGroupClean ?? true) && followup.processGroupClean
        && !followup.descendantsObserved && commandStatus(followup) === 0;
      const exitCode = (primary ? commandStatus(primary) : 0) || (clean && !primary?.descendantsObserved ? 0 : 125);
      writeFileSync(result, `${JSON.stringify({ version: 1, primary: primary ?? null, cleanup: followup, clean, exitCode })}\n`);
      fsyncSync(result);
      syncDirectory(resultDir);
      if (clean) {
        unlinkSync(dirtyPath);
        syncDirectory(lockDir);
      }
      return exitCode;
    } finally {
      closeSync(result);
    }
  } finally {
    closeSync(lock);
  }
}

export async function supervise(script: string, mode: string, path: string): Promise<number> {
  const child = spawn(process.execPath, [script, "--resource-worker", mode, path], {
    detached: true, stdio: ["ignore", "ignore", "inherit", "ipc"], env: safeEnv,
  });
  const stop = () => {
    if (child.connected) child.send("stop", () => {});
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    return await new Promise((resolve) => {
      child.once("error", () => resolve(2));
      child.once("exit", (code, signal) => {
        resolve(code ?? (signal ? 128 + os.signals[signal] : 2));
      });
    });
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}
