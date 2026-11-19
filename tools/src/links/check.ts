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

function isInScope(root: string, path: string) {
  const local = relative(root, path);
  const segments = local.split(sep);
  return !isAbsolute(local) && segments[0] !== ".."
    && !segments.some((part) => excluded.has(part));
}

function* markdownFiles(directory: string): Generator<string> {
  const entries = readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (excluded.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) yield* markdownFiles(path);
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
  const files = [...markdownFiles(root)].sort();
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
      if (!isInScope(root, candidate)) continue;
      const target = resolveExisting(candidate);
      if (target && !isInScope(root, target)) continue;

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
