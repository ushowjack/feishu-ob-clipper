const corePromise = import(chrome.runtime.getURL("src/content-core.js"));
const imageBlobCache = new Map();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "EXTRACT_ARTICLE") {
    extractArticle().then(sendResponse);
    return true;
  }
  if (message?.type === "FETCH_IMAGE") {
    fetchImage(message.url, message.cacheId).then(sendResponse);
    return true;
  }
  return false;
});

async function extractArticle() {
  try {
    imageBlobCache.clear();
    const core = await corePromise;
    if (core.isLikelyAccessError(document)) {
      return { ok: false, error: "当前页面未登录、无访问权限或文档不存在。" };
    }
    const root = core.findArticleRoot(document);
    if (!root) {
      return { ok: false, error: "没有识别到已加载的飞书正文，请等待页面加载完成后重试。" };
    }
    const clone = await extractCompleteArticle(core, root);
    core.absolutizeCloneUrls(clone, location.href);
    const textLength = String(clone.textContent ?? "").replace(/\s+/g, "").length;
    if (textLength < 30) {
      return { ok: false, error: "识别到的正文过短，为避免保存空页面，本次未写入文件。" };
    }
    return {
      ok: true,
      article: {
        title: core.extractDocumentTitle(document),
        html: clone.innerHTML,
        url: location.href,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "读取飞书正文失败。" };
  }
}

async function extractCompleteArticle(core, root) {
  if (!root.matches?.(".page-main")) return core.cleanArticleClone(root);
  const scrollContainer = core.findDocumentScrollContainer(document, root);
  if (!scrollContainer || scrollContainer.scrollHeight <= scrollContainer.clientHeight + 100) {
    return core.cleanArticleClone(root);
  }

  const originalScrollTop = scrollContainer.scrollTop;
  const blocks = new Map();
  try {
    const result = await core.collectVirtualizedBlocks({
      scrollContainer,
      renderAtCurrentPosition: () => waitForStableRenderedBlocks(core, blocks),
    });
    if (!result.complete) {
      throw new Error("飞书正文仍在加载，未能确认已采集到文档末尾，本次未写入文件。请稍后重试。");
    }
  } finally {
    scrollContainer.scrollTop = originalScrollTop;
    await waitForVirtualRender(40);
  }

  return blocks.size ? core.buildArticleFromBlocks(document, blocks) : core.cleanArticleClone(root);
}

async function waitForStableRenderedBlocks(core, blocks) {
  const result = await core.waitForStableCollection({
    wait: () => waitForVirtualRender(80),
    collect: () => core.collectRenderedBlocks(document, blocks),
  });
  await core.cacheRenderedBlobImages({
    documentRef: document,
    collection: blocks,
    cache: imageBlobCache,
    readImage: readImageBlob,
  });
  return result;
}

function waitForVirtualRender(delay = 90) {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, delay)));
  });
}

async function fetchImage(rawUrl, cacheId) {
  try {
    const cached = cacheId ? imageBlobCache.get(cacheId) : null;
    if (cached?.blob) {
      return {
        ok: true,
        dataUrl: await blobToDataUrl(cached.blob),
        mimeType: cached.mimeType || cached.blob.type,
      };
    }

    const core = await corePromise;
    const url = core.resolveFetchableImageUrl(rawUrl, location.href);
    if (url.protocol === "data:") {
      return { ok: true, dataUrl: url.href, mimeType: url.href.slice(5, url.href.indexOf(";")) || "image/png" };
    }

    const response = await fetch(url.href, { credentials: "include", cache: "no-store" });
    if (!response.ok) throw new Error(`图片请求失败（HTTP ${response.status}）`);
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) throw new Error("返回内容不是图片");
    if (blob.size > 25 * 1024 * 1024) throw new Error("单张图片超过 25 MB 限制");
    return { ok: true, dataUrl: await blobToDataUrl(blob), mimeType: blob.type };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "图片读取失败" };
  }
}

async function readImageBlob(rawUrl) {
  const response = await fetch(rawUrl, { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error(`图片请求失败（HTTP ${response.status}）`);
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("返回内容不是图片");
  if (blob.size > 25 * 1024 * 1024) throw new Error("单张图片超过 25 MB 限制");
  return { blob, mimeType: blob.type };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("图片编码失败")));
    reader.readAsDataURL(blob);
  });
}
