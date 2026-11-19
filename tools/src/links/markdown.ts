import GithubSlugger from "github-slugger";
import MarkdownIt, { type Token } from "markdown-it";
import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";

type LocatedValue = { line: number; value: string };

const markdown = MarkdownIt({ html: true });

function headingText(tokens: Token[]): string {
  return tokens.map(({ type, content }) => {
    if (type === "text" || type === "code_inline") return content;
    if (type === "softbreak" || type === "hardbreak") return "\n";
    return "";
  }).join("");
}

function normalizeHtmlUrl(value: string): string {
  // The URL parser trims C0 controls and spaces before removing ASCII tabs and newlines.
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) <= 0x20) start += 1;
  while (end > start && value.charCodeAt(end - 1) <= 0x20) end -= 1;
  return value.slice(start, end).replace(/[\t\r\n]/gu, "");
}

function visitHtml(
  node: DefaultTreeAdapterTypes.ChildNode,
  firstLine: number,
  anchors: LocatedValue[],
  links: LocatedValue[],
): void {
  if (!("tagName" in node)) return;

  const id = node.attrs.find(({ name }) => name === "id")?.value;
  const name = node.tagName === "a"
    ? node.attrs.find((attr) => attr.name === "name")?.value
    : undefined;
  const destinationAttribute = node.tagName === "a" ? "href" : "src";
  const destination = node.tagName === "a" || node.tagName === "img"
    ? node.attrs.find((attr) => attr.name === destinationAttribute)?.value
    : undefined;
  const line = firstLine + (node.sourceCodeLocation?.startLine ?? 1) - 1;

  for (const value of new Set([id, name])) {
    if (value) anchors.push({ line, value });
  }
  if (destination !== undefined) links.push({ line, value: normalizeHtmlUrl(destination) });
  for (const child of node.childNodes) visitHtml(child, firstLine, anchors, links);
}

export function parseMarkdown(source: string) {
  const slugger = new GithubSlugger();
  const headings = new Map<string, number>();
  const explicit: LocatedValue[] = [];
  const links: LocatedValue[] = [];
  const tokens = markdown.parse(source, {});

  function inspect(token: Token, line: number) {
    if (token.type === "html_block" || token.type === "html_inline") {
      const html = parseFragment(token.content, { sourceCodeLocationInfo: true });
      for (const node of html.childNodes) visitHtml(node, line, explicit, links);
    }

    const attribute = token.type === "link_open" ? "href"
      : token.type === "image" ? "src"
      : undefined;
    const destination = attribute ? token.attrGet(attribute) : null;
    if (typeof destination === "string") links.push({ value: destination, line });

    if (token.type === "image") return;
    for (const child of token.children ?? []) {
      inspect(child, line);
      if (child.type === "softbreak" || child.type === "hardbreak") line += 1;
      if (child.type === "html_inline") line += child.content.split("\n").length - 1;
    }
  }

  let line = 1;
  for (const [index, token] of tokens.entries()) {
    if (token.map) line = token.map[0] + 1;
    if (token.type === "heading_open") {
      const text = headingText(tokens[index + 1]?.children ?? []);
      headings.set(slugger.slug(text), line);
    }
    inspect(token, line);
  }

  return { headings, explicit, links };
}
