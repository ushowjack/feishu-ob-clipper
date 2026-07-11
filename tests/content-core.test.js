import test from "node:test";
import assert from "node:assert/strict";

import {
  absolutizeCloneUrls,
  blockTypeToSemanticTag,
  cacheRenderedBlobImages,
  chooseArticleCandidate,
  cleanArticleClone,
  collectRenderedBlocks,
  collectVirtualizedBlocks,
  extractDocumentDate,
  resolveFetchableImageUrl,
  scoreArticleCandidate,
  stabilizeFeishuImageUrls,
  consumeCachedImage,
  waitForStableCollection,
} from "../src/content-core.js";
import { element, text } from "./support/fake-dom.js";

function candidate({ text, blocks = 0, hidden = false, className = "" }) {
  return {
    textContent: text,
    hidden,
    tagName: "DIV",
    className,
    style: {},
    getAttribute(name) {
      if (name === "aria-hidden") return hidden ? "true" : null;
      if (name === "role") return null;
      return null;
    },
    getClientRects() {
      return hidden ? [] : [{}];
    },
    querySelectorAll() {
      return Array.from({ length: blocks });
    },
  };
}

test("优先选择长正文而非导航", () => {
  const nav = candidate({ text: "首页 文档 设置", blocks: 1 });
  const article = candidate({ text: "这是一段足够长的正文".repeat(30), blocks: 12 });
  assert.equal(chooseArticleCandidate([nav, article]), article);
});

test("优先提取页面明确的发布日期而不是修改日期", () => {
  const publishedMeta = { getAttribute: (name) => name === "content" ? "2026-06-30T14:55:00+08:00" : null };
  const modifiedHeader = { textContent: "7月3日修改", getAttribute: () => null };
  const documentRef = {
    querySelector(selector) {
      if (selector === "meta[property='article:published_time']") return publishedMeta;
      return null;
    },
    querySelectorAll(selector) {
      return selector === ".page-block-header" ? [modifiedHeader] : [];
    },
  };

  assert.equal(extractDocumentDate(documentRef, new Date(2026, 6, 12)), "2026-06-30");
});

test("没有发布日期时从正文头部修改日期提取页面日期", () => {
  const documentRef = {
    querySelector() { return null; },
    querySelectorAll(selector) {
      if (selector === ".page-block-header") return [{ textContent: "文章标题 7月3日修改", getAttribute: () => null }];
      if (selector === ".note-meta__desc") return [{ textContent: "最新修改时间为07月02日", getAttribute: () => null }];
      return [];
    },
  };

  assert.equal(extractDocumentDate(documentRef, new Date(2026, 6, 12)), "2026-07-03");
});

test("不会把正文中的普通日期误识别成页面日期", () => {
  const documentRef = {
    querySelector() { return null; },
    querySelectorAll() { return []; },
    body: { textContent: "正文提到 2025年3月1日 的历史事件" },
  };

  assert.equal(extractDocumentDate(documentRef, new Date(2026, 6, 12)), "");
});

test("忽略隐藏节点和过短内容", () => {
  assert.equal(chooseArticleCandidate([
    candidate({ text: "长文本".repeat(100), blocks: 10, hidden: true }),
  ]), null);
  assert.equal(chooseArticleCandidate([
    candidate({ text: "短", blocks: 1 }),
  ]), null);
});

test("编辑器语义特征获得额外分数", () => {
  const plain = candidate({ text: "正文".repeat(50), blocks: 8 });
  const editor = candidate({ text: "正文".repeat(50), blocks: 8, className: "ProseMirror editor" });
  assert.ok(scoreArticleCandidate(editor) > scoreArticleCandidate(plain));
});

test("导航角色不会被当作正文", () => {
  const navigation = candidate({ text: "导航内容".repeat(100), blocks: 20 });
  navigation.getAttribute = (name) => name === "role" ? "navigation" : null;
  assert.equal(scoreArticleCandidate(navigation), Number.NEGATIVE_INFINITY);
});

test("把正文中的相对链接和懒加载图片转换为绝对地址", () => {
  const link = element("a", { href: "/docx/abc" });
  const image = element("img", { "data-src": "./image/1.png" });
  const clone = element("div", {}, [link, image]);
  absolutizeCloneUrls(clone, "https://a.feishu.cn/wiki/token");
  assert.equal(link.getAttribute("href"), "https://a.feishu.cn/docx/abc");
  assert.equal(image.getAttribute("src"), "https://a.feishu.cn/wiki/image/1.png");
});

test("允许读取飞书页面生成的 blob 图片地址", () => {
  assert.equal(
    resolveFetchableImageUrl(
      "blob:https://a.feishu.cn/7b7dd13f-707a-4a91-a5cb-7b4490b0e25f",
      "https://a.feishu.cn/wiki/token",
    ).protocol,
    "blob:",
  );
  assert.equal(resolveFetchableImageUrl("/image/1.png", "https://a.feishu.cn/wiki/token").protocol, "https:");
  assert.throws(
    () => resolveFetchableImageUrl("javascript:alert(1)", "https://a.feishu.cn/wiki/token"),
    /不支持的图片地址/,
  );
});

test("把飞书 blob 图片替换成基于 token 的稳定下载地址", () => {
  const attributes = new Map([["src", "blob:https://a.feishu.cn/temporary"]]);
  const image = {
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, String(value)),
  };
  const block = { getAttribute: (name) => name === "data-record-id" ? "record/1" : null };
  const holder = {
    getAttribute: (name) => name === "image-token" ? "token/1" : null,
    querySelector: (selector) => selector === "img" ? image : null,
    closest: (selector) => selector === "[data-record-id]" ? block : null,
  };
  const root = {
    querySelectorAll: (selector) => selector === "[image-token]" ? [holder] : [],
  };

  stabilizeFeishuImageUrls(root);

  const stable = new URL(image.getAttribute("src"));
  assert.equal(stable.protocol, "https:");
  assert.equal(stable.hostname, "internal-api-drive-stream.feishu.cn");
  assert.match(stable.pathname, /\/cover\/token%2F1\/$/);
  assert.equal(stable.searchParams.get("mount_node_token"), "record/1");
});

test("图片仍在当前屏幕时立即缓存 blob 数据", async () => {
  const cloneAttributes = new Map();
  const cloneImage = { setAttribute: (name, value) => cloneAttributes.set(name, String(value)) };
  const liveImage = { getAttribute: (name) => name === "src" ? "blob:https://a.feishu.cn/current" : null };
  const liveBlock = {
    getAttribute: (name) => name === "data-record-id" ? "record-1" : null,
    querySelectorAll: (selector) => selector === "img" ? [liveImage] : [],
  };
  const documentRef = {
    querySelectorAll: () => [liveBlock],
  };
  const collection = new Map([["record-1", {
    clone: { querySelectorAll: (selector) => selector === "img" ? [cloneImage] : [] },
  }]]);
  const cache = new Map();

  const captured = await cacheRenderedBlobImages({
    documentRef,
    collection,
    cache,
    readImage: async (src) => ({ src, bytes: 123 }),
  });

  assert.equal(captured, 1);
  assert.equal(cloneAttributes.get("data-feishu-cache-id"), "record-1:0");
  assert.deepEqual(cache.get("record-1:0"), { src: "blob:https://a.feishu.cn/current", bytes: 123 });
});

test("图片传输完成后立即删除对应缓存", async () => {
  const cache = new Map([["record-1:0", { bytes: 123 }]]);
  const result = await consumeCachedImage(cache, "record-1:0", async (cached) => cached.bytes);
  assert.equal(result, 123);
  assert.equal(cache.has("record-1:0"), false);
});

test("图片传输失败时也删除对应缓存", async () => {
  const cache = new Map([["record-1:0", { bytes: 123 }]]);
  await assert.rejects(
    () => consumeCachedImage(cache, "record-1:0", async () => { throw new Error("编码失败"); }),
    /编码失败/,
  );
  assert.equal(cache.has("record-1:0"), false);
});

test("清理评论控件时保留飞书图片区块的内容容器", () => {
  let removed = false;
  const imageWrapper = {
    className: "block-comment image-block-comment",
    querySelector: (selector) => selector === "img" ? {} : null,
    remove: () => { removed = true; },
  };
  const clone = {
    querySelectorAll: (selector) => selector.includes("[class*='comment']") ? [imageWrapper] : [],
  };
  const articleRoot = { cloneNode: () => clone };

  assert.equal(cleanArticleClone(articleRoot), clone);
  assert.equal(removed, false);
});

test("保留带飞书批注标记的正文文字", () => {
  let removed = false;
  const commentedText = {
    className: "author text-comment comment-id-123",
    querySelector: () => null,
    remove: () => { removed = true; },
  };
  const clone = {
    querySelectorAll: (selector) => selector.includes("[class*='comment']") ? [commentedText] : [],
  };
  const articleRoot = { cloneNode: () => clone };

  cleanArticleClone(articleRoot);
  assert.equal(removed, false);
});

test("清除飞书图片区块中的打印占位提示", () => {
  let removed = false;
  const placeholder = { remove: () => { removed = true; } };
  const clone = {
    querySelectorAll: (selector) => selector.includes(".gpf-biz-action-manager-forbidden-placeholder")
      ? [placeholder]
      : [],
  };
  cleanArticleClone({ cloneNode: () => clone });
  assert.equal(removed, true);
});

test("当前飞书 page-main 正文优先于外围应用壳", () => {
  const article = candidate({ text: "正文".repeat(500), blocks: 30, className: "page-main docx-width-mode-standard" });
  const shell = candidate({ text: "正文与目录评论".repeat(500), blocks: 100, className: "app suite-docx" });
  assert.equal(chooseArticleCandidate([shell, article]), article);
});

test("把飞书块类型映射为语义标签", () => {
  assert.equal(blockTypeToSemanticTag("heading1"), "h1");
  assert.equal(blockTypeToSemanticTag("heading3"), "h3");
  assert.equal(blockTypeToSemanticTag("text"), "p");
  assert.equal(blockTypeToSemanticTag("ordered"), "ol");
  assert.equal(blockTypeToSemanticTag("bullet"), "ul");
  assert.equal(blockTypeToSemanticTag("divider"), "hr");
  assert.equal(blockTypeToSemanticTag("image"), "p");
  assert.equal(blockTypeToSemanticTag("unknown"), "div");
});

test("同一区块后续加载完整时替换首次采集的空内容", () => {
  const empty = feishuBlock("7", "heading2", [text("\u200B")]);
  const complete = feishuBlock("7", "heading2", [text("五，小白如何快速上手（SOP）")]);
  let rendered = [empty];
  const documentRef = { querySelectorAll: () => rendered };
  const collection = new Map();

  assert.equal(collectRenderedBlocks(documentRef, collection), 1);
  rendered = [complete];
  assert.equal(collectRenderedBlocks(documentRef, collection), 1);
  assert.match(collection.get("record-7").clone.textContent, /小白如何快速上手/);
});

test("同一图片区块在图片地址加载后替换首次采集结果", () => {
  const pending = feishuBlock("8", "image", [element("img")]);
  const loaded = feishuBlock("8", "image", [element("img", { src: "https://internal-api-drive-stream.feishu.cn/x" })]);
  let rendered = [pending];
  const documentRef = { querySelectorAll: () => rendered };
  const collection = new Map();

  collectRenderedBlocks(documentRef, collection);
  rendered = [loaded];
  assert.equal(collectRenderedBlocks(documentRef, collection), 1);
  assert.equal(collection.get("record-8").clone.querySelectorAll("img")[0].getAttribute("src"), "https://internal-api-drive-stream.feishu.cn/x");
});

test("文档高度在滚动中增长时继续采集到新的底部", async () => {
  const scrollContainer = { clientHeight: 1_000, scrollHeight: 2_000, scrollTop: 0 };
  const visited = [];
  let size = 0;

  const result = await collectVirtualizedBlocks({
    scrollContainer,
    renderAtCurrentPosition: async () => {
      visited.push(scrollContainer.scrollTop);
      if (scrollContainer.scrollTop >= 700 && scrollContainer.scrollHeight === 2_000) {
        scrollContainer.scrollHeight = 3_500;
      }
      size += 1;
      return { changes: 0, size };
    },
  });

  assert.equal(result.complete, true);
  assert.ok(visited.some((position) => position >= 2_500));
});

test("虚拟文档始终无法稳定时返回未完成", async () => {
  const scrollContainer = { clientHeight: 1_000, scrollHeight: 2_000, scrollTop: 0 };
  const result = await collectVirtualizedBlocks({
    scrollContainer,
    maxPasses: 3,
    renderAtCurrentPosition: async () => {
      scrollContainer.scrollHeight += 500;
      return { changes: 1, size: 1 };
    },
  });
  assert.equal(result.complete, false);
});

test("至少等待若干轮再判定区块稳定，捕获稍晚加载的图片", async () => {
  const changes = [0, 0, 1, 0, 0];
  let calls = 0;
  const result = await waitForStableCollection({
    wait: async () => {},
    collect: () => changes[calls++] ?? 0,
    minPasses: 4,
    maxPasses: 10,
  });
  assert.equal(result.changes, 1);
  assert.equal(calls, 5);
});

function feishuBlock(id, type, children) {
  const block = element("div", {
    "data-block-id": id,
    "data-record-id": `record-${id}`,
    "data-block-type": type,
  }, children);
  block.cloneNode = () => block;
  return block;
}
