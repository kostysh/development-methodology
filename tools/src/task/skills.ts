import { createHash, randomUUID } from "node:crypto";
import { closeSync, constants, cpSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { Client } from "../metrics/setup.js";
import { git, outsideRepository } from "./store.js";

export type Skills = { policy: "none" | "tracked" | "per-checkout"; names: string[]; source?: string; digests?: string[] };

function digest(path: string) {
  const hash = createHash("sha256");
  function visit(dir: string, prefix: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name, "en"))) {
      const file = join(dir, entry.name), label = prefix + entry.name;
      if (entry.isDirectory()) visit(file, label + "/");
      else if (entry.isFile()) hash.update(JSON.stringify([label, lstatSync(file).mode & 0o111, createHash("sha256").update(readFileSync(file)).digest("hex")]));
      else throw new Error("The selected skill contains a link or special file.");
    }
  }
  if (!lstatSync(path).isDirectory() || !lstatSync(join(path, "SKILL.md")).isFile()) throw new Error("Missing skill entry point.");
  visit(path, "");
  return hash.digest("hex");
}

export function chooseSkills(policy = "none", names: string[] = [], source?: string): Skills {
  if (!["none", "tracked", "per-checkout"].includes(policy) || (policy === "none") !== (names.length === 0) ||
      names.some(name => !/^[a-z0-9][a-z0-9-]{0,62}$/u.test(name)) || new Set(names).size !== names.length ||
      (policy === "per-checkout") !== !!source) throw new Error("Select an explicit skill policy, names, and approved source for per-checkout copies.");
  if (!source) return { policy: policy as Skills["policy"], names };
  if (!isAbsolute(source) || source !== realpathSync(source)) throw new Error("Use a canonical path to the approved skill collection.");
  outsideRepository(source);
  return { policy: "per-checkout", names, source, digests: names.map(name => digest(join(source, name))) };
}

export function prepareSkills(policy: Skills, root: string, clients: Client[]) {
  if (policy.policy === "none") return;
  for (const client of clients) {
    const folder = client === "codex" ? ".agents" : ".claude";
    // Pin the destination directories: an edited workspace symlink must never
    // redirect coordinator copies into another checkout or operator files.
    const handles: number[] = [];
    let dest = root;
    try {
      for (const part of [folder, "skills"]) {
        const path = join(dest, part);
        if (policy.policy === "per-checkout" && !existsSync(path)) mkdirSync(path, { mode: 0o700 });
        const fd = openSync(path, constants.O_DIRECTORY | constants.O_NOFOLLOW);
        handles.push(fd);
        dest = "/proc/self/fd/" + fd;
      }
      for (const [index, name] of policy.names.entries()) {
        const target = join(dest, name);
        if (policy.policy === "tracked") {
          const entry = join(folder, "skills", name, "SKILL.md");
          git(root, "ls-files", "--error-unmatch", "--", entry);
          if (!lstatSync(target).isDirectory() || !lstatSync(join(target, "SKILL.md")).isFile()) throw new Error("Tracked skill unavailable.");
          continue;
        }
        const expected = policy.digests![index];
        if (lstatSync(target, { throwIfNoEntry: false })) {
          if (digest(target) !== expected) throw new Error("Existing checkout skill differs from the approved copy.");
          continue;
        }
        const stage = join(dest, ".install-" + randomUUID());
        try {
          cpSync(join(policy.source!, name), stage, { recursive: true, errorOnExist: true, force: false });
          if (digest(stage) !== expected) throw new Error("Approved skill source changed. Review it before installation.");
          renameSync(stage, target);
        } finally { rmSync(stage, { recursive: true, force: true }); }
      }
    } finally { for (const fd of handles.reverse()) closeSync(fd); }
  }
}
