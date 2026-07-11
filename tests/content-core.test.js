import test from "node:test";
import assert from "node:assert/strict";

import {
  absolutizeCloneUrls,
  chooseArticleCandidate,
  scoreArticleCandidate,
} from "../src/content-core.js";
import { element } from "./support/fake-dom.js";

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
