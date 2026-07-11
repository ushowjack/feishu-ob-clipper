const BLOCK_SELECTOR = "p,h1,h2,h3,h4,h5,h6,li,pre,blockquote,tr,img";
const ARTICLE_SELECTORS = [
  ".page-main",
  ".page-main-item.editor",
  "[data-docx-content]",
  ".docx-editor",
  ".docx-editor-container",
  ".suite-editor",
  ".ProseMirror",
  "[contenteditable='true'][role='textbox']",
  "[contenteditable='true']",
  "main",
  "[role='main']",
];

const REMOVE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "button",
  "nav",
  "[role='navigation']",
  "[role='toolbar']",
  "[aria-hidden='true']",
  "[data-testid*='toolbar']",
  "[data-testid*='comment']",
  ".gpf-biz-action-manager-forbidden-placeholder",
  "[class*='toolbar']",
  "[class*='catalog']",
  "[class*='sidebar']",
  "[style*='display: none']",
  "[style*='display:none']",
];

export function scoreArticleCandidate(element) {
  if (!element || !isElementVisible(element)) return Number.NEGATIVE_INFINITY;
  const role = String(element.getAttribute?.("role") ?? "").toLowerCase();
  const tagName = String(element.tagName ?? "").toLowerCase();
  if (["navigation", "toolbar", "dialog"].includes(role) || ["nav", "aside"].includes(tagName)) {
    return Number.NEGATIVE_INFINITY;
  }

  const text = normalizeText(element.textContent);
  if (text.length < 80) return Number.NEGATIVE_INFINITY;

  const blockCount = Number(element.querySelectorAll?.(BLOCK_SELECTOR)?.length ?? 0);
  const semantic = `${element.className ?? ""} ${element.getAttribute?.("data-testid") ?? ""}`;
  const editorBonus = /ProseMirror|docx|suite-editor|document-content/i.test(semantic) ? 500 : 0;
  const pageMainBonus = /(?:^|\s)page-main(?:\s|$)/.test(semantic) ? 8_000 : 0;
  return Math.min(text.length, 50_000) + Math.min(blockCount, 2_000) * 24 + editorBonus + pageMainBonus;
}

export function chooseArticleCandidate(candidates) {
  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates ?? []) {
    const score = scoreArticleCandidate(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return Number.isFinite(bestScore) ? best : null;
}

export function findArticleRoot(documentRef) {
  const candidates = [];
  const seen = new Set();
  for (const selector of ARTICLE_SELECTORS) {
    for (const element of Array.from(documentRef.querySelectorAll(selector))) {
      if (!seen.has(element)) {
        seen.add(element);
        candidates.push(element);
      }
    }
  }
  return chooseArticleCandidate(candidates);
}

export function cleanArticleClone(articleRoot) {
  const clone = articleRoot.cloneNode(true);
  clone.querySelectorAll?.(REMOVE_SELECTORS.join(",")).forEach((element) => element.remove());
  stabilizeFeishuImageUrls(clone);
  return clone;
}

export function stabilizeFeishuImageUrls(root) {
  for (const holder of Array.from(root?.querySelectorAll?.("[image-token]") ?? [])) {
    const image = holder.querySelector?.("img");
    const source = image?.getAttribute?.("src") || "";
    if (!source.startsWith("blob:")) continue;

    const imageToken = holder.getAttribute?.("image-token");
    const recordId = holder.closest?.("[data-record-id]")?.getAttribute?.("data-record-id");
    if (!imageToken || !recordId) continue;

    const url = new URL(
      `https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/v2/cover/${encodeURIComponent(imageToken)}/`,
    );
    url.search = new URLSearchParams({
      fallback_source: "1",
      height: "1280",
      mount_node_token: recordId,
      mount_point: "docx_image",
      policy: "equal",
      width: "1280",
    }).toString();
    image.setAttribute("src", url.href);
  }
  return root;
}

export function absolutizeCloneUrls(clone, baseUrl) {
  clone.querySelectorAll?.("a[href]").forEach((link) => {
    const href = link.getAttribute("href");
    try {
      link.setAttribute("href", new URL(href, baseUrl).href);
    } catch {
      link.removeAttribute?.("href");
    }
  });
  clone.querySelectorAll?.("img").forEach((image) => {
    const source = image.getAttribute("src") || image.getAttribute("data-src") || image.getAttribute("data-original");
    if (!source) return;
    try {
      image.setAttribute("src", new URL(source, baseUrl).href);
    } catch {
      image.removeAttribute?.("src");
    }
  });
  return clone;
}

export function resolveFetchableImageUrl(rawUrl, baseUrl) {
  const url = new URL(String(rawUrl), baseUrl);
  if (!["data:", "https:", "blob:"].includes(url.protocol)) {
    throw new Error("不支持的图片地址");
  }
  return url;
}

export function findDocumentScrollContainer(documentRef, articleRoot) {
  const closest = articleRoot?.closest?.(".bear-web-x-container");
  if (closest) return closest;
  return documentRef.querySelector(".bear-web-x-container, [class*='docx'][class*='scroll']");
}

export function collectRenderedBlocks(documentRef, collection) {
  const blocks = documentRef.querySelectorAll(".page-main .block[data-block-id][data-record-id]");
  let changed = 0;
  for (const block of Array.from(blocks)) {
    const type = block.getAttribute("data-block-type") || "unknown";
    if (type === "page") continue;
    const recordId = block.getAttribute("data-record-id");
    if (!recordId) continue;
    const candidate = {
      recordId,
      order: Number(block.getAttribute("data-block-id")) || Number.MAX_SAFE_INTEGER,
      type,
      clone: cleanArticleClone(block),
    };
    const current = collection.get(recordId);
    if (current && blockCompletenessScore(candidate.clone) <= blockCompletenessScore(current.clone)) continue;
    collection.set(recordId, candidate);
    changed += 1;
  }
  return changed;
}

export async function collectVirtualizedBlocks({
  scrollContainer,
  renderAtCurrentPosition,
  maxPasses = 240,
  stableBottomPasses = 2,
}) {
  const step = Math.max(400, Number(scrollContainer.clientHeight || 0) * 0.7);
  let position = 0;
  let lastBottomMax = null;
  let stablePasses = 0;
  let passes = 0;

  while (passes < maxPasses && stablePasses < stableBottomPasses) {
    const maxBefore = documentMaxScroll(scrollContainer);
    const target = Math.min(position, maxBefore);
    scrollContainer.scrollTop = target;
    const result = await renderAtCurrentPosition();
    passes += 1;

    const maxAfter = documentMaxScroll(scrollContainer);
    const atBottom = target >= maxAfter - 1;
    if (atBottom) {
      stablePasses = lastBottomMax === maxAfter && Number(result?.changes || 0) === 0
        ? stablePasses + 1
        : 0;
      lastBottomMax = maxAfter;
      position = maxAfter;
    } else {
      stablePasses = 0;
      lastBottomMax = null;
      position = Math.min(target + step, maxAfter);
    }
  }

  return { complete: stablePasses >= stableBottomPasses, passes };
}

export async function cacheRenderedBlobImages({
  documentRef,
  collection,
  cache,
  readImage,
}) {
  let captured = 0;
  const liveBlocks = documentRef.querySelectorAll(".page-main .block[data-record-id]");
  for (const liveBlock of Array.from(liveBlocks)) {
    const recordId = liveBlock.getAttribute("data-record-id");
    const record = collection.get(recordId);
    if (!record) continue;

    const liveImages = Array.from(liveBlock.querySelectorAll?.("img") ?? []);
    const clonedImages = Array.from(record.clone.querySelectorAll?.("img") ?? []);
    for (let index = 0; index < Math.min(liveImages.length, clonedImages.length); index += 1) {
      const source = liveImages[index].getAttribute?.("src") || "";
      if (!source.startsWith("blob:")) continue;

      const cacheId = `${recordId}:${index}`;
      if (!cache.has(cacheId)) {
        try {
          cache.set(cacheId, await readImage(source));
        } catch {
          continue;
        }
      }
      clonedImages[index].setAttribute("data-feishu-cache-id", cacheId);
      captured += 1;
    }
  }
  return captured;
}

export async function consumeCachedImage(cache, cacheId, consume) {
  if (!cacheId || !cache.has(cacheId)) return null;
  const cached = cache.get(cacheId);
  try {
    return await consume(cached);
  } finally {
    cache.delete(cacheId);
  }
}

export async function waitForStableCollection({
  wait,
  collect,
  minPasses = 4,
  maxPasses = 15,
  requiredStablePasses = 2,
}) {
  let stablePasses = 0;
  let totalChanges = 0;
  let passes = 0;
  while (passes < maxPasses) {
    await wait();
    const changes = Number(collect() || 0);
    totalChanges += changes;
    passes += 1;
    stablePasses = changes === 0 ? stablePasses + 1 : 0;
    if (passes >= minPasses && stablePasses >= requiredStablePasses) break;
  }
  return { changes: totalChanges, passes };
}

export function buildArticleFromBlocks(documentRef, collection) {
  const container = documentRef.createElement("div");
  const records = Array.from(collection.values()).sort((left, right) => left.order - right.order);
  let activeList = null;
  let activeListTag = "";

  for (const record of records) {
    const semanticTag = blockTypeToSemanticTag(record.type);
    if (semanticTag === "ol" || semanticTag === "ul") {
      if (!activeList || activeListTag !== semanticTag) {
        activeList = documentRef.createElement(semanticTag);
        activeListTag = semanticTag;
        container.append(activeList);
      }
      const item = documentRef.createElement("li");
      copyBlockContent(record.clone, item);
      if (record.type === "todo") {
        const input = documentRef.createElement("input");
        input.setAttribute("type", "checkbox");
        if (/checked|done|completed/.test(String(record.clone.className))) input.setAttribute("checked", "");
        item.prepend(input);
      }
      activeList.append(item);
      continue;
    }

    activeList = null;
    activeListTag = "";
    if (semanticTag === "hr") {
      container.append(documentRef.createElement("hr"));
      continue;
    }
    if (semanticTag === "pre") {
      const pre = documentRef.createElement("pre");
      const code = documentRef.createElement("code");
      code.textContent = blockContentSource(record.clone).textContent || "";
      pre.append(code);
      container.append(pre);
      continue;
    }
    if (semanticTag === "div") {
      container.append(record.clone);
      continue;
    }

    const wrapper = documentRef.createElement(semanticTag);
    copyBlockContent(record.clone, wrapper);
    container.append(wrapper);
  }
  return container;
}

export function blockTypeToSemanticTag(type) {
  const normalized = String(type ?? "").toLowerCase();
  if (/^heading[1-6]$/.test(normalized)) return `h${normalized.at(-1)}`;
  if (["text", "paragraph", "callout"].includes(normalized)) return "p";
  if (["ordered", "ordered_list", "numbered"].includes(normalized)) return "ol";
  if (["bullet", "bullet_list", "todo", "task"].includes(normalized)) return "ul";
  if (["quote", "blockquote"].includes(normalized)) return "blockquote";
  if (["code", "code_block"].includes(normalized)) return "pre";
  if (["divider", "horizontal_rule"].includes(normalized)) return "hr";
  if (normalized === "image") return "p";
  return "div";
}

function copyBlockContent(block, target) {
  const source = blockContentSource(block);
  for (const child of Array.from(source.childNodes ?? [])) target.append(child.cloneNode(true));
}

function blockContentSource(block) {
  return block.querySelector?.(".ace-line")
    || block.querySelector?.("[data-slate-editor='true']")
    || block;
}

export function extractDocumentTitle(documentRef) {
  const inputSelectors = [
    "input[data-testid*='title']",
    "textarea[data-testid*='title']",
    ".docx-title-input",
    "[class*='title'] input",
  ];
  for (const selector of inputSelectors) {
    const value = documentRef.querySelector(selector)?.value?.trim();
    if (value) return value;
  }

  const textSelectors = [
    "[data-testid*='title']",
    ".wiki-title",
    ".docx-title",
    ".page-main h1",
    "h1",
  ];
  for (const selector of textSelectors) {
    const value = normalizeText(documentRef.querySelector(selector)?.textContent);
    if (value && value.length <= 300) return value;
  }

  return String(documentRef.title ?? "")
    .replace(/\s*[-–—|]\s*(?:飞书云文档|飞书).*$/u, "")
    .trim() || "未命名飞书文档";
}

export function extractDocumentDate(documentRef, now = new Date()) {
  const metadataSelectors = [
    "meta[property='article:published_time']",
    "meta[name='article:published_time']",
    "meta[name='publish_time']",
    "[itemprop='datePublished']",
    "time[datetime]",
  ];
  for (const selector of metadataSelectors) {
    const element = documentRef.querySelector?.(selector);
    const rawValue = element?.getAttribute?.("content")
      || element?.getAttribute?.("datetime")
      || element?.textContent;
    const date = normalizeDocumentDate(rawValue, now, false);
    if (date) return date;
  }

  const textSelectors = [
    "[data-testid*='publish']",
    "[class*='publish']",
    ".page-block-header",
    ".note-meta__desc",
    "[class*='document'][class*='meta']",
  ];
  for (const selector of textSelectors) {
    for (const element of Array.from(documentRef.querySelectorAll?.(selector) ?? [])) {
      const date = normalizeDocumentDate(element?.textContent, now, true);
      if (date) return date;
    }
  }
  return "";
}

export function isLikelyAccessError(documentRef) {
  const text = normalizeText(documentRef.body?.innerText ?? documentRef.body?.textContent).slice(0, 2_000);
  return /(?:无权限|暂无权限|申请访问|请求访问|登录后查看|请先登录|页面不存在|文档已删除)/.test(text);
}

function isElementVisible(element) {
  if (element.hidden || element.getAttribute?.("aria-hidden") === "true") return false;
  if (element.style?.display === "none" || element.style?.visibility === "hidden") return false;

  const view = element.ownerDocument?.defaultView;
  if (view?.getComputedStyle) {
    const style = view.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }

  if (typeof element.getClientRects === "function" && element.getClientRects().length === 0) return false;
  return true;
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeDocumentDate(value, now, requireDateLabel) {
  const text = normalizeText(value);
  if (!text || (requireDateLabel && !/(?:发布|创建|修改)/.test(text))) return "";

  const full = text.match(/(\d{4})[年/.-](\d{1,2})[月/.-](\d{1,2})(?:日)?/);
  if (full) return validDateParts(Number(full[1]), Number(full[2]), Number(full[3]));

  const short = text.match(/(\d{1,2})月(\d{1,2})日/);
  if (!short) return "";
  const month = Number(short[1]);
  const day = Number(short[2]);
  let year = now.getFullYear();
  const candidate = new Date(year, month - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (candidate > today) year -= 1;
  return validDateParts(year, month, day);
}

function validDateParts(year, month, day) {
  const candidate = new Date(year, month - 1, day);
  if (
    candidate.getFullYear() !== year
    || candidate.getMonth() !== month - 1
    || candidate.getDate() !== day
  ) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function blockCompletenessScore(block) {
  const textLength = String(block?.textContent ?? "")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/g, "")
    .length;
  const images = Array.from(block?.querySelectorAll?.("img") ?? []);
  const loadedImages = images.filter((image) => (
    image.getAttribute?.("src")
    || image.getAttribute?.("data-src")
    || image.getAttribute?.("data-original")
  )).length;
  return textLength * 2 + images.length * 100 + loadedImages * 5_000;
}

function documentMaxScroll(scrollContainer) {
  return Math.max(0, Number(scrollContainer.scrollHeight || 0) - Number(scrollContainer.clientHeight || 0));
}
