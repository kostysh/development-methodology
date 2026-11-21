import { createHash, randomUUID } from "node:crypto";
import {
  closeSync, constants, fchmodSync, fstatSync, linkSync, openSync, readFileSync,
  realpathSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import MarkdownIt from "markdown-it";
import { utf8 } from "../baseline/git.js";
import { locked } from "../task/store.js";
import { readGit } from "./git.js";
import { Rejection } from "./input.js";

const end = "<!-- skill-loading:end -->";

function readFile(path: string) {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    const stat = fstatSync(fd, { bigint: true });
    if (!stat.isFile() || stat.nlink !== 1n) throw new Rejection(`Expected a regular file with one hard link at ${path}`);
    const text = utf8(readFileSync(fd), path);
    if (text.includes("\0")) throw new Rejection(`Invalid instruction text in ${path}`);
    return { stat, text };
  } finally { closeSync(fd); }
}

const markdown = MarkdownIt({ html: true });
type Span = { start: number; after: number; raw: string };

function inspect(text: string, label: string) {
  // Token maps use line numbers. Slice the original text to retain every project byte.
  const offsets = [0, ...Array.from(text.matchAll(/\r\n|[\r\n]/gu), m => m.index + m[0].length)];
  const markers: Span[] = [];
  const paragraphs: Span[] = [];
  for (const token of markdown.parse(text, {})) {
    if (token.level !== 0 || !token.map || (token.type !== "html_block" && token.type !== "paragraph_open")) continue;
    const start = offsets[token.map[0]];
    const after = offsets[token.map[1]] ?? text.length;
    const raw = text.slice(start, after).replace(/(?:\r\n|[\r\n])$/u, "");
    if (token.type === "paragraph_open") paragraphs.push({ start, after, raw });
    else if (/^\s*<!--\s*\/?skill-loading\b/iu.test(raw)) markers.push({ start, after, raw });
  }
  if (!markers.length) return { paragraphs };
  const [first, last] = markers;
  const opening = /^<!-- skill-loading:start(?: sha256=([0-9a-f]{64}))? -->$/u.exec(first.raw);
  const paragraph = paragraphs.find(p => p.start === first.after && p.after === last?.start);
  if (markers.length !== 2 || !opening || last.raw !== end || !paragraph) {
    throw new Rejection(`Expected one intact pair of skill-loading markers around a standalone paragraph in ${label}`);
  }
  const block = { start: first.start, stop: last.start + last.raw.length, hash: opening[1], rule: paragraph.raw };
  return { paragraphs, block };
}

function guideRule(guide: string) {
  const path = resolve(guide, "method/15-skills.md");
  if (realpathSync(path) !== path) throw new Rejection(`Unexpected symlink in guide path ${path}`);
  const { block } = inspect(readFile(path)?.text ?? "", path);
  const rule = block?.rule.replaceAll("\r\n", "\n");
  if (!rule || rule !== rule.trim() || block?.hash) {
    throw new Rejection(`Expected one marked skill-loading paragraph in ${path}`);
  }
  return rule;
}

function digest(text: string) {
  return createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex");
}

function update(text: string, rule: string, name: string) {
  const bom = text.startsWith("\uFEFF") ? "\uFEFF" : "";
  const content = text.slice(bom.length);
  const eol = /\r?\n/u.exec(content)?.[0] ?? "\n";
  const paragraph = rule.replaceAll("\n", eol);
  const replacement = [`<!-- skill-loading:start sha256=${digest(rule)} -->`, paragraph, end].join(eol);
  const { block, paragraphs } = inspect(content, name);
  if (block) {
    if (!block.hash || block.hash !== digest(block.rule)) {
      throw new Rejection(`Local changes in the skill-loading block of ${name}. Compare it with method/15-skills.md before retrying.`);
    }
    if (block.rule.replaceAll("\r\n", "\n") === rule) return text;
    return bom + content.slice(0, block.start) + replacement + content.slice(block.stop);
  }

  // Adopt only a project instruction. Preserve examples in fences or HTML comments.
  const matches = paragraphs.filter(p => p.raw.replaceAll("\r\n", "\n") === rule);
  if (matches.length > 1) throw new Rejection(`Multiple matching skill-loading paragraphs in ${name}; reconcile the copies.`);
  if (matches.length === 1) {
    const { start, raw } = matches[0];
    return bom + content.slice(0, start) + replacement + content.slice(start + raw.length);
  }
  let separator = "";
  if (content && !content.endsWith(eol + eol)) separator = content.endsWith(eol) ? eol : eol + eol;
  const added = content + separator + replacement + eol;
  if (!inspect(added, name).block) throw new Rejection(`Cannot append an active skill-loading paragraph to ${name}. Check for an unclosed Markdown block.`);
  return bom + added;
}

function target() {
  const override = readFile("AGENTS.override.md");
  if (override) return { name: "AGENTS.override.md", file: override };
  return { name: "AGENTS.md", file: readFile("AGENTS.md") };
}

export function syncSkillRule(guide: string) {
  const cwd = process.cwd();
  if (readGit(cwd, ["rev-parse", "--show-toplevel"], "project root").output !== cwd + "\n") {
    throw new Rejection("Run sync-skill-rule from the project Git root");
  }
  const rule = guideRule(guide);
  return locked(cwd, () => {
    const { name, file } = target();
    const text = update(file?.text ?? "", rule, name);
    if (text === file?.text) return { path: name, status: "unchanged" };
    const temporary = join(cwd, "." + name + "." + randomUUID());
    const fd = openSync(temporary, "wx", file ? 0o600 : 0o644);
    try {
      try {
        writeFileSync(fd, text);
        if (file) fchmodSync(fd, Number(file.stat.mode & 0o7777n));
      } finally { closeSync(fd); }
      const current = target();
      if (current.name !== name || current.file?.stat.ino !== file?.stat.ino ||
          current.file?.stat.ctimeNs !== file?.stat.ctimeNs || current.file?.text !== file?.text) {
        throw new Rejection(`Root instructions changed during synchronization. Review ${name} and retry.`);
      }
      if (file) renameSync(temporary, name);
      else linkSync(temporary, name);
    } finally {
      rmSync(temporary, { force: true });
    }
    return { path: name, status: file ? "updated" : "created" };
  });
}
