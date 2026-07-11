const BLOCK_SELECTOR = "p,h1,h2,h3,h4,h5,h6,li,pre,blockquote,tr,img";
const ARTICLE_SELECTORS = [
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
  "[class*='toolbar']",
  "[class*='comment']",
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
  return Math.min(text.length, 50_000) + Math.min(blockCount, 2_000) * 24 + editorBonus;
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
  return clone;
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
