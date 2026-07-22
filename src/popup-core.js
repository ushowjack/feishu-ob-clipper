import { isSupportedArticleUrl } from "./site-rules.js";

export function validateSupportedArticleUrl(value) {
  return isSupportedArticleUrl(value);
}

export function dataUrlToBlob(value) {
  const match = String(value).match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
  if (!match) throw new Error("图片数据不是有效的 data URL");
  const mimeType = match[1] || "application/octet-stream";
  if (match[2]) {
    const binary = atob(match[3]);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new Blob([bytes], { type: mimeType });
  }
  return new Blob([decodeURIComponent(match[3])], { type: mimeType });
}

export function localIsoTimestamp(date = new Date(), timezoneOffset = date.getTimezoneOffset()) {
  const local = new Date(date.getTime() - timezoneOffset * 60_000);
  const body = local.toISOString().slice(0, 19);
  const sign = timezoneOffset <= 0 ? "+" : "-";
  const absolute = Math.abs(timezoneOffset);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  return `${body}${sign}${hours}:${minutes}`;
}

export function localDate(date = new Date()) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function nextPropertyKey(properties, base = "property") {
  const keys = new Set((properties ?? []).map((field) => String(field.key ?? "").trim()));
  if (!keys.has(base)) return base;
  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const candidate = `${base}_${suffix}`;
    if (!keys.has(candidate)) return candidate;
  }
  throw new Error("属性数量过多，请删除不需要的属性后重试");
}

export function shouldPreserveStatus(className) {
  return /(?:^|\s)(?:error|warning|success)(?:\s|$)/.test(String(className ?? ""));
}
