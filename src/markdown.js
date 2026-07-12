const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

export function convertArticle(root, options) {
  const title = String(options?.title ?? "未命名笔记").replace(/\p{Cf}/gu, "").trim() || "未命名笔记";
  const images = [];
  const context = {
    images,
    imagesByIdentity: new Map(),
    source: normalizeLink(options?.source),
  };
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

  if (isFeishuGrid(node)) return renderFeishuGrid(node, context);

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
      const cacheId = node.getAttribute?.("data-feishu-cache-id");
      const identity = imageIdentity(src, cacheId);
      const existing = context.imagesByIdentity.get(identity);
      if (existing) return imagePlaceholder(existing.id, state.inGrid);
      const id = context.images.length + 1;
      const image = { id, src, alt: node.getAttribute?.("alt") || "图片" };
      if (cacheId) image.cacheId = cacheId;
      if (state.inGrid) image.layout = "grid";
      context.imagesByIdentity.set(identity, image);
      context.images.push(image);
      return imagePlaceholder(id, state.inGrid);
    }
    case "video": {
      const src = findVideoSource(node);
      if (!src) return "";
      const title = findVideoTitle(node);
      if (src.startsWith("blob:")) {
        const label = `视频：${escapeLinkLabel(title)}（打开飞书原文）`;
        return context.source ? `[${label}](${context.source})\n\n` : `${label}\n\n`;
      }
      return `[视频：${escapeLinkLabel(title)}](${normalizeLink(src)})\n\n`;
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

function renderFeishuGrid(grid, context) {
  const columns = collectDescendants(grid, isFeishuGridColumn);
  if (!columns.length) return renderBlock(renderChildren(grid, context));

  const renderedColumns = columns
    .map((column, index) => renderFeishuGridColumn(column, context, index, columns.length))
    .filter(Boolean)
    .join("\n");
  if (!renderedColumns) return "";

  return [
    '<div class="feishu-image-grid" style="display:flex;flex-wrap:wrap;align-items:flex-start;gap:16px;">',
    renderedColumns,
    "</div>",
    "",
    "",
  ].join("\n");
}

function renderFeishuGridColumn(column, context, index, count) {
  const content = renderChildren(column, context, { block: true, inGrid: true }).trim();
  if (!content) return "";
  const basis = extractGridColumnBasis(column) || `calc(${(100 / count).toFixed(4)}% - 8px)`;
  return [
    `<div class="feishu-image-grid__column" style="flex-basis:${basis};flex-grow:0;flex-shrink:0;min-width:0;" data-column="${index + 1}">`,
    content,
    "</div>",
  ].join("\n");
}

function isFeishuGrid(node) {
  const className = classNameOf(node);
  return /(?:^|\s)grid-block(?:\s|$)/.test(className);
}

function isFeishuGridColumn(node) {
  const className = classNameOf(node);
  return /(?:^|\s)docx-grid_column-block(?:\s|$)/.test(className);
}

function classNameOf(node) {
  return String(node?.getAttribute?.("class") ?? node?.className ?? "");
}

function collectDescendants(node, predicate, matches = []) {
  for (const child of Array.from(node?.childNodes ?? [])) {
    if (predicate(child)) matches.push(child);
    collectDescendants(child, predicate, matches);
  }
  return matches;
}

function extractGridColumnBasis(column) {
  const style = String(column?.getAttribute?.("style") ?? "");
  const value = style.match(/(?:^|;)\s*width:\s*([^;]+)/i)?.[1]?.trim() ?? "";
  return /^(?:\d+(?:\.\d+)?%|calc\(\s*\d+(?:\.\d+)?%\s*-\s*\d+(?:\.\d+)?px\s*\))$/i.test(value)
    ? value
    : "";
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

function findVideoTitle(video) {
  const preserved = video.getAttribute?.("data-feishu-video-title");
  const header = video.closest?.(".preview-card-header")?.textContent;
  const label = String(preserved || header || "").replace(/\s+/g, " ").trim();
  return label || "飞书视频";
}

function findVideoSource(video) {
  const sources = Array.from(video.querySelectorAll?.("source[src],source[data-src]") ?? []);
  const candidates = [
    video.getAttribute?.("src"),
    video.getAttribute?.("data-src"),
    ...sources.flatMap((source) => [
      source.getAttribute?.("src"),
      source.getAttribute?.("data-src"),
    ]),
  ].map((value) => String(value ?? "").trim()).filter(Boolean);
  return candidates.find((value) => !value.startsWith("blob:")) || candidates[0] || "";
}

function escapeLinkLabel(value) {
  return String(value ?? "飞书视频").replace(/[\[\]]/g, "").trim() || "飞书视频";
}

function imageIdentity(src, cacheId) {
  try {
    const url = new URL(src);
    const token = url.pathname.match(/\/(?:preview|cover)\/([^/]+)\/?$/)?.[1];
    return token ? `feishu:${token}` : url.href;
  } catch {
    return String(src) || `cache:${cacheId}`;
  }
}

function imagePlaceholder(id, inGrid) {
  return inGrid ? `@@FEISHU_GRID_IMAGE_${id}@@` : `@@FEISHU_IMAGE_${id}@@`;
}
