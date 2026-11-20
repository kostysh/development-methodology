import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";

// Only the test inbox is mounted. The installed coordinator runs outside the
// fixture, as its ordinary UID, against actual independently owned OS files.
export function soloOwner(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "solo-owner-"));
  const dir = join(root, "independent");
  mkdirSync(dir);
  const base = readFileSync(new URL("../assets/train/verifier/Dockerfile", import.meta.url), "utf8")
    .match(/^ARG VERIFY_BASE=(\S+)/mu)![1];
  function owner(uid: number, script: string, input = "") {
    execFileSync("docker", ["run", "--rm", "-i", "--network=none", "--read-only",
      "--security-opt=no-new-privileges", "--user", String(uid), "--mount", "type=bind,src=" + dir + ",dst=/inbox",
      "--entrypoint", "/bin/sh", base, "-eu", "-c", script], { input, stdio: ["pipe", "pipe", "pipe"] });
  }
  const ownerId = process.getuid!() === 65534 ? 65533 : 65534;
  owner(0, "chown " + ownerId + " /inbox && chmod 0755 /inbox");
  t.after(() => {
    owner(ownerId, "rm -f /inbox/solo.json /inbox/answers.json");
    rmSync(root, { recursive: true, force: true });
  });
  const approvals = join(dir, "answers.json");
  const save = (items: unknown) => owner(ownerId, "umask 022; cat > /inbox/answers.json", JSON.stringify(items));
  const profile = join(dir, "solo.json");
  const setup = (policy: object) => {
    owner(ownerId, "umask 022; cat > /inbox/solo.json", JSON.stringify({
      ...policy, approvals, approvals_owner_uid: statSync(dir).uid,
    }));
    save([]);
  };
  const changeMode = (mode: "0644" | "0662") => owner(ownerId, "chmod " + mode + " /inbox/answers.json");
  return { profile, approvals, setup, save, changeMode };
}
