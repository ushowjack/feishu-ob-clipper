const TITLE_SELECTOR = ".post-title--for-long-article, .post-title";
const ARTICLE_CONTAINER_SELECTOR = ":scope > .content-container";
const CREDENTIALLESS_IMAGE_HOSTS = new Set([
  "article-images.zsxq.com",
  "sphere-sh.oss-cn-shanghai.aliyuncs.com",
  "sphere-search-mobile.oss-cn-shanghai.aliyuncs.com",
]);

export function findScysArticleRoot(documentRef) {
  for (const title of Array.from(documentRef.querySelectorAll(TITLE_SELECTOR))) {
    const article = title.closest?.("main")?.querySelector?.(ARTICLE_CONTAINER_SELECTOR);
    if (article) return article;
  }
  return null;
}

export function appendScysArticleImages(articleClone, articleRoot) {
  const imageList = articleRoot?.closest?.("main")?.querySelector?.(":scope > .image-list");
  if (imageList) articleClone?.append?.(imageList.cloneNode(true));
  return articleClone;
}

export function extractScysArticle(articleRoot) {
  const clone = articleRoot.cloneNode(true);
  normalizeScysArticleClone(clone);
  return appendScysArticleImages(clone, articleRoot);
}

export function normalizeScysArticleClone(root) {
  root.querySelectorAll?.(".feishu-doc-stream .player, .feishu-doc-stream .title img.icon")
    .forEach((element) => element.remove());

  const documentRef = root.ownerDocument;
  if (!documentRef?.createElement) return root;

  const blocks = Array.from(root.querySelectorAll?.(".feishu-doc-content > .vc-doc-item") ?? []);
  for (const block of blocks) {
    const bullet = block.querySelector?.(".bullet_container");
    const order = block.querySelector?.(".block-order");
    const tableContainer = block.querySelector?.(".table");
    const classification = classifyScysBlock({
      className: block.className,
      hasBullet: Boolean(bullet),
      hasOrder: Boolean(order),
      tableClass: tableContainer?.className,
    });

    if (classification.kind === "heading") {
      const heading = documentRef.createElement(`h${classification.level}`);
      heading.textContent = normalizeText(block.textContent);
      block.replaceWith(heading);
      continue;
    }

    if (classification.kind === "list-item") {
      const item = documentRef.createElement("li");
      item.setAttribute("data-scys-list-tag", classification.listTag);
      if (classification.listTag === "ul") {
        const content = bullet.querySelector?.(".list") ?? bullet;
        appendClonedChildren(item, content);
      } else {
        const content = order.cloneNode(true);
        content.querySelector?.(".order-marker")?.remove();
        appendClonedChildren(item, content);
      }
      block.replaceWith(item);
      continue;
    }

    if (classification.kind === "table") {
      const table = buildScysTable(documentRef, tableContainer, classification.columns);
      if (table) block.replaceWith(table);
    }
  }

  groupScysListItems(root, documentRef);
  return root;
}

export function classifyScysBlock({
  className = "",
  hasBullet = false,
  hasOrder = false,
  tableClass = "",
} = {}) {
  const headingLevel = String(className).match(/(?:^|\s)doc-heading-([1-6])(?:\s|$)/)?.[1];
  if (headingLevel) return { kind: "heading", level: Number(headingLevel) };
  if (hasBullet) return { kind: "list-item", listTag: "ul" };
  if (hasOrder) return { kind: "list-item", listTag: "ol" };
  const columns = Number(String(tableClass).match(/(?:^|\s)table_(\d+)(?:\s|$)/)?.[1] ?? 0);
  if (columns > 0) return { kind: "table", columns };
  return { kind: "content" };
}

export function extractScysMetadata(documentRef) {
  const title = normalizeText(
    documentRef.querySelector?.(TITLE_SELECTOR)?.textContent
      || documentRef.title,
  ) || "未命名文章";
  const dateText = normalizeText(documentRef.querySelector?.(".post-item-top .date")?.textContent);
  const date = dateText.match(/(\d{4})-(\d{2})-(\d{2})/);
  return {
    title,
    publishedDate: date ? `${date[1]}-${date[2]}-${date[3]}` : "",
  };
}

function buildScysTable(documentRef, tableContainer, columns) {
  const sourceCells = Array.from(tableContainer?.querySelectorAll?.(".table_cell") ?? []);
  if (!sourceCells.length || columns < 1) return null;

  const table = documentRef.createElement("table");
  const head = documentRef.createElement("thead");
  const body = documentRef.createElement("tbody");
  for (let offset = 0; offset < sourceCells.length; offset += columns) {
    const rowCells = sourceCells.slice(offset, offset + columns);
    if (rowCells.length !== columns) break;
    const row = documentRef.createElement("tr");
    for (const sourceCell of rowCells) {
      const cell = documentRef.createElement(offset === 0 ? "th" : "td");
      appendClonedChildren(cell, sourceCell);
      row.append(cell);
    }
    (offset === 0 ? head : body).append(row);
  }
  if (head.children.length) table.append(head);
  if (body.children.length) table.append(body);
  return table;
}

function groupScysListItems(root, documentRef) {
  for (const content of Array.from(root.querySelectorAll?.(".feishu-doc-content") ?? [])) {
    let activeList = null;
    let activeTag = "";
    for (const child of Array.from(content.children ?? [])) {
      const listTag = child.getAttribute?.("data-scys-list-tag") ?? "";
      if (!listTag) {
        activeList = null;
        activeTag = "";
        continue;
      }
      if (!activeList || activeTag !== listTag) {
        const wrapper = documentRef.createElement("div");
        activeList = documentRef.createElement(listTag);
        activeTag = listTag;
        wrapper.setAttribute("data-scys-list-group", "");
        wrapper.append(activeList);
        child.before(wrapper);
      }
      child.removeAttribute("data-scys-list-tag");
      activeList.append(child);
    }
  }
}

function appendClonedChildren(target, source) {
  for (const child of Array.from(source?.childNodes ?? [])) {
    target.append(child.cloneNode(true));
  }
  if (!target.childNodes.length && normalizeText(source?.textContent)) {
    target.textContent = normalizeText(source.textContent);
  }
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function shouldOmitScysImageCredentials(rawUrl, pageUrl) {
  try {
    return CREDENTIALLESS_IMAGE_HOSTS.has(new URL(rawUrl, pageUrl).hostname);
  } catch {
    return false;
  }
}
