import test from "node:test";
import assert from "node:assert/strict";

import {
  absolutizeCloneUrls,
  blockTypeToSemanticTag,
  chooseArticleCandidate,
  cleanArticleClone,
  collectRenderedBlocks,
  collectVirtualizedBlocks,
  scoreArticleCandidate,
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
