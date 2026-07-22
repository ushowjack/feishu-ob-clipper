import { shouldOmitScysImageCredentials } from "./scys-site.js";

export const ARTICLE_SOURCE = Object.freeze({
  FEISHU: "feishu",
  SCYS: "scys",
});

export function detectArticleSource(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;

    const isFeishuHost = url.hostname === "feishu.cn" || url.hostname.endsWith(".feishu.cn");
    if (isFeishuHost && /^\/(?:wiki|docx|docs)\//.test(url.pathname)) {
      return ARTICLE_SOURCE.FEISHU;
    }

    if (url.hostname === "scys.com" && url.pathname.startsWith("/articleDetail/")) {
      return ARTICLE_SOURCE.SCYS;
    }

    return null;
  } catch {
    return null;
  }
}

export function isSupportedArticleUrl(value) {
  return detectArticleSource(value) !== null;
}

export function getImageFetchCredentials(rawUrl, pageUrl) {
  const isScysPage = detectArticleSource(pageUrl) === ARTICLE_SOURCE.SCYS;
  return isScysPage && shouldOmitScysImageCredentials(rawUrl, pageUrl) ? "omit" : "include";
}
