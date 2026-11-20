import { join } from "node:path";
import type { Config } from "./config.js";
import type { Kind, Suite } from "./engine.js";
import type { Objects } from "./git.js";
import { command } from "./process.js";

export function container(id: string) {
  if (!/^[a-f\d-]{36}$/.test(id)) throw new Error("Invalid owned resource ID");
  return "methodology-train-" + id;
}
export function cleanupContainer(id: string, deadline: number) {
  const name = container(id);
  const list = command("docker", ["ps", "-aq", "--filter", "name=^/" + name + "$"], { deadline });
  if (list.out) {
    const owner = command("docker", ["inspect", "--format", '{{index .Config.Labels "methodology.train.run"}}', name], {deadline});
    if (owner.out !== id) throw new Error("Container ownership mismatch");
    command("docker", ["rm", "-f", "--volumes", name], {deadline});
  }
}
export function runSuite(c: Config, git: Objects, id: string, kind: Kind, sha: string, tests: string[]): Suite {
  const root = join(git.dir, "..", "snapshot");
  git.checkout(sha, root);
  try {
    const run = command("docker", ["run", "--pull=never", "--rm", "--name", container(id),
      "--label", "methodology.train.run=" + id, "--network=none", "--read-only",
      "--cap-drop=ALL", "--security-opt=no-new-privileges", "--user=65534:65534",
      "--pids-limit=256", "--memory=1g", "--cpus=2", "--tmpfs=/tmp:rw,nosuid,nodev,size=256m",
      "--mount", "type=bind,src=" + root + ",dst=/candidate,readonly,bind-propagation=rprivate,bind-recursive=disabled",
      c.suiteImage, kind, sha, ...tests],
    { deadline: git.deadline, allowed: [0,1,125,126,127,137] });
    if (run.code !== 0) return { result: "infra", detail: "container exit " + run.code,
      ...([125,126,127].includes(run.code) ? {} : {started:true}) };
    const row = JSON.parse(run.out);
    if (row.result === "pass" && Object.keys(row).length === 1) return {result: "pass"};
    if (row.result === "fail" && Array.isArray(row.tests) && row.tests.length > 0 && row.tests.length <= 256 &&
      row.tests.every((t: unknown) => typeof t === "string" && /^[\w][\w.:/-]{0,199}$/.test(t) &&
        (kind !== "targeted" || tests.includes(t)))) return {result: "fail", tests: [...new Set<string>(row.tests)]};
    return { result: "infra", detail: "Verifier emitted an invalid result", started:true };
  } catch (e) {
    if (e instanceof Error && e.message === "Train timeout") throw e;
    return {result: "infra", detail: "Verifier unavailable or malformed output"};
  }
}
