import {
  nextAvailableName,
  parseRelativeDirectory,
  sanitizeFilename,
} from "./path-utils.js";

const MIME_EXTENSIONS = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
  ["image/svg+xml", "svg"],
]);

export async function queryVaultPermission(handle) {
  if (!handle?.queryPermission) return "denied";
  return handle.queryPermission({ mode: "readwrite" });
}

export async function requestVaultPermission(handle) {
  if (!handle?.requestPermission) return false;
  return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
}

export async function saveArticleToVault({
  vaultHandle,
  noteDirectory,
  attachmentDirectory,
  article,
  imageResults,
}) {
  if (!vaultHandle || vaultHandle.kind !== "directory") {
    throw new Error("Obsidian Vault 目录无效，请重新选择");
  }

  const noteDirectorySegments = parseRelativeDirectory(noteDirectory);
  const attachmentDirectorySegments = parseRelativeDirectory(attachmentDirectory);
  const noteFolder = await ensureDirectory(vaultHandle, noteDirectorySegments);
  const safeTitle = sanitizeFilename(article?.title);
  const noteName = await nextAvailableName(safeTitle, (name) => fileExists(noteFolder, name));
  const noteStem = noteName.slice(0, -3);

  let markdown = String(article?.markdown ?? "");
  let savedImages = 0;
  let failedImages = 0;
  const warnings = [];
  let attachmentFolder = null;

  for (const image of article?.images ?? []) {
    const placeholder = `@@FEISHU_IMAGE_${image.id}@@`;
    const gridPlaceholder = `@@FEISHU_GRID_IMAGE_${image.id}@@`;
    const result = imageResults?.get(image.id);
    if (result?.ok && result.blob instanceof Blob) {
      try {
        attachmentFolder ??= await ensureDirectory(vaultHandle, attachmentDirectorySegments);
        const extension = extensionFor(result.mimeType || result.blob.type, image.src);
        const base = sanitizeWikiLinkName(`${noteStem}-${String(image.id).padStart(2, "0")}`);
        const imageName = await nextAvailableAssetName(attachmentFolder, base, extension);
        await writeFile(attachmentFolder, imageName, result.blob);
        const relativePath = [...attachmentDirectorySegments, imageName].join("/");
        markdown = replaceAll(markdown, placeholder, `![[${encodeWikiPath(relativePath)}]]`);
        markdown = replaceAll(
          markdown,
          gridPlaceholder,
          htmlLocalImage(relativeAssetPath(noteDirectorySegments, attachmentDirectorySegments, imageName), image.alt),
        );
        savedImages += 1;
        continue;
      } catch (error) {
        warnings.push(`图片 ${image.id} 写入失败：${errorMessage(error)}`);
      }
    } else {
      warnings.push(`图片 ${image.id} 下载失败：${result?.error || "未获得图片数据"}`);
    }

    markdown = replaceAll(markdown, placeholder, markdownRemoteImage(image.alt, image.src));
    markdown = replaceAll(markdown, gridPlaceholder, htmlRemoteImage(image.alt, image.src));
    failedImages += 1;
  }

  const noteHandle = await noteFolder.getFileHandle(noteName, { create: true });
  await writeHandle(noteHandle, markdown);

  return {
    notePath: [...noteDirectorySegments, noteName].join("/"),
    savedImages,
    failedImages,
    warnings,
  };
}

async function ensureDirectory(root, segments) {
  let current = root;
  for (const segment of segments) {
    current = await current.getDirectoryHandle(segment, { create: true });
  }
  return current;
}

async function fileExists(directory, name) {
  try {
    await directory.getFileHandle(name, { create: false });
    return true;
  } catch (error) {
    if (error?.name === "NotFoundError") return false;
    throw error;
  }
}

async function nextAvailableAssetName(directory, base, extension) {
  for (let attempt = 1; attempt <= 999; attempt += 1) {
    const suffix = attempt === 1 ? "" : `-${attempt}`;
    const name = `${base}${suffix}.${extension}`;
    if (!(await fileExists(directory, name))) return name;
  }
  throw new Error("附件目录中存在过多同名图片");
}

async function writeFile(directory, name, value) {
  const handle = await directory.getFileHandle(name, { create: true });
  await writeHandle(handle, value);
}

async function writeHandle(handle, value) {
  const writable = await handle.createWritable();
  try {
    await writable.write(value);
    await writable.close();
  } catch (error) {
    await writable.abort?.();
    throw error;
  }
}

function extensionFor(mimeType, sourceUrl) {
  const cleanMime = String(mimeType ?? "").split(";")[0].toLowerCase();
  if (MIME_EXTENSIONS.has(cleanMime)) return MIME_EXTENSIONS.get(cleanMime);
  try {
    const extension = new URL(sourceUrl).pathname.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension)) {
      return extension === "jpeg" ? "jpg" : extension;
    }
  } catch {
    // 图片 URL 不合法时回退为 PNG 扩展名。
  }
  return "png";
}

function sanitizeWikiLinkName(value) {
  return sanitizeFilename(value).replace(/[\[\]#^]/g, " ").replace(/\s+/g, " ").trim();
}

function markdownRemoteImage(alt, src) {
  const safeAlt = String(alt || "图片").replace(/([\\\[\]])/g, "\\$1");
  const safeUrl = encodeURI(String(src ?? "")).replace(/\(/g, "%28").replace(/\)/g, "%29");
  return `![${safeAlt}](${safeUrl})`;
}

function htmlLocalImage(relativePath, alt) {
  return `<img class="feishu-image" src="${escapeHtml(encodeRelativePath(relativePath))}" alt="${escapeHtml(alt || "图片")}" style="width:100%;height:auto;display:block;">`;
}

function htmlRemoteImage(alt, src) {
  return `<img class="feishu-image" src="${escapeHtml(encodeURI(String(src ?? "")))}" alt="${escapeHtml(alt || "图片")}" style="width:100%;height:auto;display:block;">`;
}

function relativeAssetPath(noteDirectorySegments, attachmentDirectorySegments, filename) {
  let common = 0;
  while (
    common < noteDirectorySegments.length
    && common < attachmentDirectorySegments.length
    && noteDirectorySegments[common] === attachmentDirectorySegments[common]
  ) common += 1;
  const parent = Array(noteDirectorySegments.length - common).fill("..");
  return [...parent, ...attachmentDirectorySegments.slice(common), filename].join("/") || filename;
}

function encodeRelativePath(value) {
  return String(value ?? "")
    .split("/")
    .map((segment) => segment === ".." ? segment : encodeURIComponent(segment))
    .join("/");
}

function encodeWikiPath(value) {
  return String(value ?? "")
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/\^/g, "%5E")
    .replace(/\|/g, "%7C")
    .replace(/\[/g, "%5B")
    .replace(/\]/g, "%5D");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function replaceAll(value, search, replacement) {
  return String(value).split(search).join(replacement);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
