import { spawnSync } from "node:child_process";

export function command(bin: string, args: string[], options: {
  cwd?: string; env?: NodeJS.ProcessEnv; input?: string; deadline: number; allowed?: number[]; writerLock?: number; authorityFd?: number;
}) {
  const ms = options.deadline - Date.now();
  if (ms <= 0) throw new Error("Train timeout");
  const r = spawnSync(bin, args, {
    stdio: ["pipe","pipe","pipe",...[options.writerLock, options.authorityFd].filter((fd): fd is number => fd !== undefined)],
    cwd: options.cwd, encoding: "utf8", input: options.input, timeout: Math.min(ms, 2_147_483_647),
    killSignal: "SIGKILL", maxBuffer: 8 * 1024 * 1024, env: { PATH: process.env.PATH, LANG: "C", ...options.env },
  });
  if (r.error || r.signal || r.status === null) {
    throw new Error((r.error as NodeJS.ErrnoException)?.code === "ETIMEDOUT" ? "Train timeout" : bin + " execution failed");
  }
  if (!(options.allowed ?? [0]).includes(r.status)) throw new Error(bin + " " + args[0] + " failed (" + r.status + ")");
  return { code: r.status, out: r.stdout.trimEnd(), err: r.stderr.trimEnd() };
}
