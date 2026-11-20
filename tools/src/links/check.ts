import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { parseMarkdown } from "./markdown.js";

const excluded = new Set([
  ".git", ".worktrees", "node_modules", "bower_components", "jspm_packages",
  ".pnpm-store", ".yarn", "web_modules", "build", "dist", "out", "coverage",
  ".cache", ".next", ".nuxt", ".output", ".svelte-kit", ".vite",
]);

function isMarkdown(path: string) {
  return /\.(md|markdown)$/iu.test(path);
}

function isInScope(root: string, path: string, nestedWorktrees: Set<string>) {
  const local = relative(root, path);
  const segments = local.split(sep);
  if (isAbsolute(local) || segments[0] === "..") return false;
  let directory = root;
  for (const part of segments) {
    directory = resolve(directory, part);
    if (excluded.has(part) || nestedWorktrees.has(directory)) return false;
  }
  return true;
}

function* markdownFiles(directory: string, root: string, nestedWorktrees: Set<string>): Generator<string> {
  const entries = readdirSync(directory, { withFileTypes: true });
  if (directory !== root && entries.some((entry) => entry.name === ".git" && entry.isFile())
      && isLinkedWorktree(directory)) {
    nestedWorktrees.add(directory);
    return;
  }
  for (const entry of entries) {
    if (excluded.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) yield* markdownFiles(path, root, nestedWorktrees);
    if (entry.isFile() && isMarkdown(path)) yield path;
  }
}

function resolveExisting(path: string): string | undefined {
  try {
    return realpathSync(path);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error
        && (error.code === "ENOENT" || error.code === "ENOTDIR")) return;
    throw error;
  }
}

function readGitPointer(path: string): string | undefined {
  const target = resolveExisting(path);
  if (!target) return;
  const info = statSync(target);
  if (!info.isFile() || info.size > 65536) return;
  return readFileSync(target, "utf8").replace(/\r?\n$/u, "");
}

function isLinkedWorktree(directory: string) {
  const marker = resolve(directory, ".git");
  const pointer = readGitPointer(marker);
  if (!pointer?.startsWith("gitdir: ")) return false;
  const location = pointer.slice("gitdir: ".length);
  if (!location || location.includes("\0")) return false;
  const administrative = resolve(directory, location);
  const backlink = readGitPointer(resolve(administrative, "gitdir"));
  if (!backlink || backlink.includes("\0") || resolveExisting(resolve(administrative, backlink)) !== marker) {
    return false;
  }
  const common = readGitPointer(resolve(administrative, "commondir"));
  if (!common || common.includes("\0")) return false;
  const commonDirectory = resolveExisting(resolve(administrative, common));
  return Boolean(commonDirectory && statSync(commonDirectory).isDirectory()
    && readGitPointer(resolve(administrative, "HEAD")));
}

function localDestination(url: string) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu.test(url)) return;
  const delimiter = url.indexOf("#");
  const pathAndQuery = delimiter < 0 ? url : url.slice(0, delimiter);
  const fragment = delimiter < 0 ? "" : decodeURIComponent(url.slice(delimiter + 1));
  const path = decodeURIComponent(pathAndQuery.split("?", 1)[0]);
  if (/[\0\\]/u.test(path)) throw new URIError("Invalid path character");
  return { path, fragment };
}

function readmeOf(directory: string) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const names = entries.filter((entry) =>
    /^readme\.(md|markdown)$/iu.test(entry.name) && entry.isFile()).map((entry) => entry.name);
  const name = names.includes("README.md") ? "README.md" : names.sort()[0];
  if (name) return resolve(directory, name);
}

const describe = (value: string) => JSON.stringify(value);

export function checkLinks(projectRoot: string) {
  const root = realpathSync(projectRoot);
  const nestedWorktrees = new Set<string>();
  const files = [...markdownFiles(root, root, nestedWorktrees)].sort();
  if (!files.length) throw new Error("project root has no Markdown files");
  const documents = new Map(files.map((path) => [
    path, parseMarkdown(readFileSync(path, "utf8")),
  ]));
  const diagnostics: string[] = [];

  for (const [source, document] of documents) {
    const localPath = relative(root, source).split(sep).join("/");
    const display = /[\r\n\t]/u.test(localPath) ? describe(localPath) : localPath;
    const report = (line: number, message: string) => {
      diagnostics.push(`${display}:${line}: ${message}`);
    };
    const seen = new Set<string>();

    for (const { value, line } of document.explicit) {
      if (seen.has(value)) report(line, `duplicate explicit anchor ${describe(value)}`);
      const headingLine = document.headings.get(value);
      if (headingLine !== undefined) {
        report(line, `explicit anchor ${describe(value)} collides with heading at line ${headingLine}`);
      }
      seen.add(value);
    }

    for (const { value, line } of document.links) {
      let destination: ReturnType<typeof localDestination>;
      try {
        destination = localDestination(value);
      } catch (error) {
        if (!(error instanceof URIError)) throw error;
        report(line, `invalid local URL ${describe(value)}`);
        continue;
      }
      if (!destination) continue;
      const { path, fragment } = destination;
      const candidate = !path ? source : path.startsWith("/")
        ? resolve(root, `.${path}`) : resolve(dirname(source), path);
      if (!isInScope(root, candidate, nestedWorktrees)) continue;
      const target = resolveExisting(candidate);
      if (target && !isInScope(root, target, nestedWorktrees)) continue;

      const info = target ? statSync(target) : undefined;
      if (!target || !info || (path.endsWith("/") ? !info.isDirectory()
        : !info.isFile() && !info.isDirectory())) {
        report(line, `unresolved local path ${describe(value)}`);
        continue;
      }
      if (!fragment) continue;

      const markdownTarget = info.isDirectory() ? readmeOf(target) : target;
      if (markdownTarget && !isMarkdown(markdownTarget)) continue;
      const targetDocument = markdownTarget ? documents.get(markdownTarget) : undefined;
      if (!targetDocument?.headings.has(fragment)
          && !targetDocument?.explicit.some((anchor) => anchor.value === fragment)) {
        report(line, `unresolved fragment ${describe(fragment)} in ${describe(value)}`);
      }
    }
  }

  return { filesChecked: files.length, diagnostics };
}
