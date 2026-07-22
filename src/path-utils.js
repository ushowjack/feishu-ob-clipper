const DEFAULT_TITLE = "未命名文章";
const MAX_FILENAME_LENGTH = 120;

export function sanitizeFilename(value, fallback = DEFAULT_TITLE) {
  const normalized = String(value ?? "")
    .normalize("NFC")
    .replace(/\p{Cf}+/gu, " ")
    .replace(/[<>:"/\\|?*\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .replace(/^[. ]+/g, "")
    .trim();

  const safe = normalized || fallback;
  return Array.from(safe).slice(0, MAX_FILENAME_LENGTH).join("");
}

export function parseRelativeDirectory(value) {
  const path = String(value ?? "").trim();
  if (!path) return [];

  if (/^(?:[a-zA-Z]:[\\/]|[\\/])/.test(path)) {
    throw new Error("目录必须是 Vault 内的相对路径");
  }

  const segments = path.replace(/\\/g, "/").split("/").filter(Boolean);
  if (segments.some((segment) => segment === "..")) {
    throw new Error("目录不能越出 Vault");
  }
  if (segments.some((segment) => segment === "." || /[\u0000-\u001F]/.test(segment))) {
    throw new Error("目录包含无效的 Vault 路径段");
  }
  return segments;
}

export async function nextAvailableName(baseName, exists, maxAttempts = 999) {
  const safeBase = sanitizeFilename(baseName);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const suffix = attempt === 1 ? "" : `-${attempt}`;
    const candidate = `${safeBase}${suffix}.md`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error("目标目录中存在过多同名文件，请修改标题或保存目录");
}

export function escapeYamlString(value) {
  const escaped = String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
  return `"${escaped}"`;
}
