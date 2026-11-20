import { createHash } from "node:crypto";
import { gitPath, regular, Repository } from "../baseline/git.js";

export type ReviewControls = {
  paths: string[];
  inventory?: { path: string; sha256: string };
};

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function reviewControls(raw: unknown): ReviewControls | undefined {
  if (raw === undefined) return;
  if (!object(raw) || Object.keys(raw).some(key => key !== "paths" && key !== "inventory") ||
      !Array.isArray(raw.paths) || !raw.paths.length) {
    throw new Error("Review controls require literal Git paths");
  }
  const paths = [...new Set(raw.paths.map(path => gitPath(path, true).replace(/\/$/,"")))];
  if (raw.inventory === undefined) return { paths };
  const entry = raw.inventory;
  if (!object(entry) || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      Object.keys(entry).some(k => k !== "path" && k !== "sha256")) {
    throw new Error("Review controls require an independently approved inventory SHA-256");
  }
  const path = gitPath(entry.path);
  if (!paths.some(root => path === root || path.startsWith(root + "/"))) paths.push(path);
  return { paths, inventory: { path, sha256: entry.sha256 } };
}

// Compare committed objects. A changed ancestor can displace a protected path.
export function changedReviewPaths(controls: ReviewControls, base: string, head: string, repository: Repository) {
  repository.commit(base, "PR base");
  repository.commit(head, "PR head");
  const ancestor = repository.commonAncestor(base, head);
  return controls.paths.filter(path => {
    const previous = repository.lookup(ancestor, path);
    const next = repository.lookup(head, path);
    return previous?.path !== next?.path || previous?.mode !== next?.mode || previous?.oid !== next?.oid;
  });
}

// The coordinator supplies a protected policy and verified Git objects.
export function checkReviewControls(controls: ReviewControls | undefined, base: string, head: string,
                                    ownerMessage: string | undefined, cwd = process.cwd()) {
  if (!controls) return { changed: [] as string[] };
  const repository = new Repository(cwd, "objects");
  const changed = changedReviewPaths(controls,base,head,repository);
  if (controls.inventory) {
    const { path, sha256 } = controls.inventory;
    const entry = repository.lookup(head, path);
    if (entry?.path !== path || !regular(entry) || createHash("sha256").update(repository.blob(entry)).digest("hex") !== sha256) {
      throw new Error("Mandatory test inventory differs from the coordinator's approved SHA-256");
    }
  }
  if (!changed.length) return { changed };
  if (typeof ownerMessage !== "string" || !ownerMessage.trim() || ownerMessage.length > 512 || /[\u0000-\u001f\u007f]/u.test(ownerMessage)) {
    throw new Error("Owner confirmation for this revision is required for " + changed.map(path => JSON.stringify(path)).join(", "));
  }
  return { changed, ownerMessage: ownerMessage.trim() };
}
