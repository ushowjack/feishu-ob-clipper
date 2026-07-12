const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

export function convertArticle(root, options) {
  const title = String(options?.title ?? "未命名笔记").replace(/\p{Cf}/gu, "").trim() || "未命名笔记";
  const images = [];
  const context = { images };
  const body = normalizeMarkdown(renderChildren(root, context, { block: true }).replace(/\p{Cf}/gu, ""));

  const frontmatter = String(options?.frontmatter ?? "").trim();
  const headingAndBody = `# ${escapeInline(title)}${body ? `\n\n${body}` : ""}\n`;
  const markdown = frontmatter ? `${frontmatter}\n\n${headingAndBody}` : headingAndBody;
  return { markdown, images };
}

function renderNode(node, context, state = {}) {
  if (!node) return "";
  if (node.nodeType === TEXT_NODE) {
    return state.raw ? String(node.nodeValue ?? node.textContent ?? "") : escapeInline(node.nodeValue ?? node.textContent ?? "");
  }
  if (node.nodeType !== ELEMENT_NODE) return "";

  const tag = String(node.tagName ?? "").toLowerCase();
  const children = () => renderChildren(node, context, state);

  if (/^h[1-6]$/.test(tag)) {
    const level = Math.min(Number(tag[1]) + 1, 6);
    const content = children().replace(/\p{Cf}/gu, "").trim();
    return content ? `${"#".repeat(level)} ${content}\n\n` : "";
  }

  switch (tag) {
    case "p":
      return renderBlock(children());
    case "div":
    case "section":
    case "article":
    case "main":
    case "header":
    case "footer":
    case "figure":
    case "figcaption":
      return renderBlock(children());
    case "span":
      return children();
    case "br":
      return "\\\n";
    case "strong":
    case "b":
      return wrapInline("**", children());
    case "em":
    case "i":
      return wrapInline("*", children());
    case "s":
    case "del":
    case "strike":
      return wrapInline("~~", children());
    case "code": {
      if (state.inPre) return String(node.textContent ?? "");
      const value = String(node.textContent ?? "");
      const fence = value.includes("`") ? "``" : "`";
      return `${fence}${fence.length > 1 ? " " : ""}${value}${fence.length > 1 ? " " : ""}${fence}`;
    }
    case "pre": {
      const code = findFirstChildByTag(node, "code") ?? node;
      const className = code.getAttribute?.("class") ?? "";
      const language = className.match(/(?:language-|lang-)([\w+-]+)/)?.[1] ?? "";
      const value = String(code.textContent ?? "").replace(/\n$/, "");
      const longestRun = Math.max(0, ...Array.from(value.matchAll(/`+/g), (match) => match[0].length));
      const fence = "`".repeat(Math.max(3, longestRun + 1));
      return `${fence}${language}\n${value}\n${fence}\n\n`;
    }
    case "a": {
      const label = children().trim();
      const href = normalizeLink(node.getAttribute?.("href"));
      if (!href) return label;
      return `[${label || href}](${href})`;
    }
    case "img": {
      const src = node.getAttribute?.("src") || node.getAttribute?.("data-src") || node.getAttribute?.("data-original") || "";
      if (!src) return "";
      const id = context.images.length + 1;
      const image = { id, src, alt: node.getAttribute?.("alt") || "图片" };
      const cacheId = node.getAttribute?.("data-feishu-cache-id");
      if (cacheId) image.cacheId = cacheId;
      context.images.push(image);
      return `@@FEISHU_IMAGE_${id}@@`;
    }
    case "ul":
    case "ol":
      return `${renderList(node, context, state.listDepth ?? 0, tag === "ol")}\n`;
    case "li":
      return children();
    case "blockquote": {
      const value = children().trim().replace(/^/gm, "> ");
      return `${value}\n\n`;
    }
    case "hr":
      return "---\n\n";
    case "table":
      return `${renderTable(node, context)}\n\n`;
    case "input":
    case "button":
    case "script":
    case "style":
    case "noscript":
      return "";
    default:
      return children();
  }
}

function renderChildren(node, context, state = {}) {
  return Array.from(node?.childNodes ?? []).map((child) => renderNode(child, context, state)).join("");
}

function renderBlock(value) {
  const content = String(value ?? "").trim();
  return content ? `${content}\n\n` : "";
}

function renderList(list, context, depth, ordered) {
  const lines = [];
  const listItems = Array.from(list.childNodes ?? []).filter((child) => String(child.tagName ?? "").toLowerCase() === "li");
  listItems.forEach((item, index) => {
    const childNodes = Array.from(item.childNodes ?? []);
    const nestedLists = childNodes.filter((child) => ["ul", "ol"].includes(String(child.tagName ?? "").toLowerCase()));
    const contentNodes = childNodes.filter((child) => !nestedLists.includes(child));
    const checkbox = contentNodes.find((child) => String(child.tagName ?? "").toLowerCase() === "input" && child.getAttribute?.("type") === "checkbox");
    const content = contentNodes
      .filter((child) => child !== checkbox)
      .map((child) => renderNode(child, context, { listDepth: depth }))
      .join("")
      .trim();
    const marker = ordered ? `${index + 1}.` : "-";
    const task = checkbox ? `[${checkbox.hasAttribute?.("checked") ? "x" : " "}] ` : "";
    const indent = "  ".repeat(depth);
    const continuationIndent = `${indent}${" ".repeat(marker.length + 1)}`;
    const indentedContent = content
      .split("\n")
      .map((line, lineIndex) => lineIndex === 0 || !line ? line : `${continuationIndent}${line}`)
      .join("\n");
    lines.push(`${indent}${marker} ${task}${indentedContent}`.trimEnd());
    for (const nested of nestedLists) {
      lines.push(renderList(nested, context, depth + 1, String(nested.tagName).toLowerCase() === "ol"));
    }
  });
  return lines.join("\n");
}

function renderTable(table, context) {
  const rows = collectByTag(table, "tr");
  if (!rows.length) return "";
  const matrix = rows.map((row) => Array.from(row.childNodes ?? [])
    .filter((cell) => ["th", "td"].includes(String(cell.tagName ?? "").toLowerCase()))
    .map((cell) => renderChildren(cell, context).trim().replace(/\|/g, "\\|").replace(/\n+/g, " ")));
  const width = Math.max(...matrix.map((row) => row.length));
  const normalized = matrix.map((row) => [...row, ...Array(Math.max(0, width - row.length)).fill("")]);
  const header = normalized[0];
  const body = normalized.slice(1);
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function collectByTag(node, tagName) {
  const matches = [];
  for (const child of Array.from(node.childNodes ?? [])) {
    if (String(child.tagName ?? "").toLowerCase() === tagName) matches.push(child);
    matches.push(...collectByTag(child, tagName));
  }
  return matches;
}

function findFirstChildByTag(node, tagName) {
  return collectByTag(node, tagName)[0] ?? null;
}

function escapeInline(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/([*_[\]#])/g, "\\$1");
}

function wrapInline(marker, value) {
  const content = value.trim();
  if (!content) return value;
  const leading = /^\s/u.test(value) ? " " : "";
  const trailing = /\s$/u.test(value) ? " " : "";
  return `${leading}${marker}${content}${marker}${trailing}`;
}

function normalizeMarkdown(value) {
  const output = [];
  let fenceLength = 0;
  let previousBlank = false;

  for (const sourceLine of String(value ?? "").split("\n")) {
    if (fenceLength) {
      output.push(sourceLine);
      const closing = sourceLine.match(/^(`{3,})\s*$/u);
      if (closing && closing[1].length >= fenceLength) fenceLength = 0;
      continue;
    }

    const line = sourceLine.trimEnd();
    const opening = line.match(/^(`{3,})[^`]*$/u);
    if (opening) {
      fenceLength = opening[1].length;
      output.push(line);
      previousBlank = false;
      continue;
    }

    if (!line) {
      if (!previousBlank) output.push("");
      previousBlank = true;
      continue;
    }

    output.push(line);
    previousBlank = false;
  }

  return output.join("\n").trim();
}

function normalizeLink(value) {
  const href = String(value ?? "").trim();
  if (!href || /^javascript:/i.test(href)) return "";
  return encodeURI(href).replace(/\(/g, "%28").replace(/\)/g, "%29");
}
