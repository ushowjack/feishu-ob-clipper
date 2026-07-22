import { ARTICLE_SOURCE, detectArticleSource, getImageFetchCredentials } from "./site-rules.js";
import {
  blockTypeToSemanticTag,
  buildArticleFromBlocks,
  cacheRenderedBlobImages,
  cleanFeishuArticleClone,
  chooseArticleCandidate,
  collectRenderedBlocks,
  collectVirtualizedBlocks,
  consumeCachedImage,
  extractFeishuArticle,
  findFeishuArticleRoot,
  findDocumentScrollContainer,
  scoreArticleCandidate,
  stabilizeFeishuImageUrls,
  waitForStableCollection,
} from "./feishu-site.js";
import {
  appendScysArticleImages,
  extractScysArticle,
  extractScysMetadata,
  findScysArticleRoot,
} from "./scys-site.js";

export {
  appendScysArticleImages,
  ARTICLE_SOURCE,
  blockTypeToSemanticTag,
  buildArticleFromBlocks,
  cacheRenderedBlobImages,
  chooseArticleCandidate,
  collectRenderedBlocks,
  collectVirtualizedBlocks,
  consumeCachedImage,
  detectArticleSource,
  extractFeishuArticle,
  extractScysArticle,
  extractScysMetadata,
  findDocumentScrollContainer,
  getImageFetchCredentials,
  scoreArticleCandidate,
  stabilizeFeishuImageUrls,
  waitForStableCollection,
};

export function findArticleRoot(documentRef, source = detectArticleSource(documentRef?.location?.href)) {
  if (source === ARTICLE_SOURCE.SCYS) return findScysArticleRoot(documentRef);
  if (source === ARTICLE_SOURCE.FEISHU) return findFeishuArticleRoot(documentRef);
  return null;
}
export function cleanArticleClone(articleRoot, source = ARTICLE_SOURCE.FEISHU) {
  if (source === ARTICLE_SOURCE.SCYS) return extractScysArticle(articleRoot);
  return cleanFeishuArticleClone(articleRoot);
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
  clone.querySelectorAll?.("video[src],source[src],video[data-src],source[data-src]").forEach((media) => {
    for (const attribute of ["src", "data-src"]) {
      const source = media.getAttribute(attribute);
      if (!source) continue;
      try {
        media.setAttribute(attribute, new URL(source, baseUrl).href);
      } catch {
        media.removeAttribute?.(attribute);
      }
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
    .replace(/\s*[-–—|]\s*(?:飞书云文档|飞书|生财有术).*$/u, "")
    .trim() || "未命名文章";
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
