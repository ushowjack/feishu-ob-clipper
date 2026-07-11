export function validateFeishuUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && (url.hostname === "feishu.cn" || url.hostname.endsWith(".feishu.cn"))
      && /^\/(?:wiki|docx|docs)\//.test(url.pathname);
  } catch {
    return false;
  }
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

export function shouldPreserveStatus(className) {
  return /(?:^|\s)(?:error|warning|success)(?:\s|$)/.test(String(className ?? ""));
}
