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
  if (message?.type === "CLEAR_IMAGE_CACHE") {
    imageBlobCache.clear();
    sendResponse({ ok: true });
    return false;
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
    const source = core.detectArticleSource(location.href);
    if (!source) {
      return { ok: false, error: "当前网址不是受支持的飞书文档或生财文章。" };
    }
    const root = core.findArticleRoot(document, source);
    if (!root) {
      const sourceName = source === core.ARTICLE_SOURCE.FEISHU ? "飞书" : "生财";
      return { ok: false, error: `没有识别到已加载的${sourceName}正文，请等待页面加载完成后重试。` };
    }
    const clone = source === core.ARTICLE_SOURCE.FEISHU
      ? await core.extractFeishuArticle({
        documentRef: document,
        articleRoot: root,
        imageCache: imageBlobCache,
        readImage: readImageBlob,
        waitForRender: waitForVirtualRender,
      })
      : core.extractScysArticle(root);
    const metadata = source === core.ARTICLE_SOURCE.SCYS
      ? core.extractScysMetadata(document)
      : {
        title: core.extractDocumentTitle(document),
        publishedDate: core.extractDocumentDate(document),
      };
    core.absolutizeCloneUrls(clone, location.href);
    const textLength = String(clone.textContent ?? "").replace(/\s+/g, "").length;
    if (textLength < 30) {
      return { ok: false, error: "识别到的正文过短，为避免保存空页面，本次未写入文件。" };
    }
    return {
      ok: true,
      article: {
        title: metadata.title,
        publishedDate: metadata.publishedDate,
        html: clone.innerHTML,
        url: location.href,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "读取文章正文失败。" };
  }
}

function waitForVirtualRender(delay = 90) {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, delay)));
  });
}

async function fetchImage(rawUrl, cacheId) {
  try {
    const core = await corePromise;
    const cachedResponse = await core.consumeCachedImage(imageBlobCache, cacheId, async (cached) => {
      if (!cached?.blob) return null;
      return {
        ok: true,
        dataUrl: await blobToDataUrl(cached.blob),
        mimeType: cached.mimeType || cached.blob.type,
      };
    });
    if (cachedResponse) return cachedResponse;

    const url = core.resolveFetchableImageUrl(rawUrl, location.href);
    if (url.protocol === "data:") {
      return { ok: true, dataUrl: url.href, mimeType: url.href.slice(5, url.href.indexOf(";")) || "image/png" };
    }

    const response = await fetch(url.href, {
      credentials: core.getImageFetchCredentials(url.href, location.href),
      cache: "no-store",
    });
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
  const core = await corePromise;
  const response = await fetch(rawUrl, {
    credentials: core.getImageFetchCredentials(rawUrl, location.href),
    cache: "no-store",
  });
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
