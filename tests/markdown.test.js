import test from "node:test";
import assert from "node:assert/strict";

import { convertArticle } from "../src/markdown.js";
import { element, text } from "./support/fake-dom.js";

const options = {
  title: '测试 "文档"',
  sourceUrl: "https://x.feishu.cn/wiki/a",
  capturedAt: "2026-07-11T12:00:00+08:00",
};

test("生成 YAML 元数据和文档标题", () => {
  const result = convertArticle(element("div", {}, [element("p", {}, [text("正文")])]), options);
  assert.match(result.markdown, /^---\ntitle: "测试 \\"文档\\""\nsource: "https:\/\/x.feishu.cn\/wiki\/a"\ncaptured_at: "2026-07-11T12:00:00\+08:00"\nsource_type: feishu\n---/);
  assert.match(result.markdown, /# 测试 "文档"\n\n正文/);
});

test("转换常见块级与行内格式", () => {
  const root = element("div", {}, [
    element("h1", {}, [text("章节")]),
    element("p", {}, [
      text("正文 "),
      element("strong", {}, [text("重点")]),
      text(" "),
      element("em", {}, [text("斜体")]),
      text(" "),
      element("a", { href: "https://example.com/a b" }, [text("链接")]),
    ]),
    element("blockquote", {}, [element("p", {}, [text("引用")])]),
    element("hr"),
    element("pre", {}, [
      element("code", { class: "language-js" }, [text("const x = 1;\nconsole.log(x);")]),
    ]),
  ]);

  const result = convertArticle(root, options);
  assert.match(result.markdown, /## 章节/);
  assert.match(result.markdown, /正文 \*\*重点\*\* \*斜体\* \[链接\]\(https:\/\/example.com\/a%20b\)/);
  assert.match(result.markdown, /> 引用/);
  assert.match(result.markdown, /\n---\n/);
  assert.match(result.markdown, /```js\nconst x = 1;\nconsole\.log\(x\);\n```/);
});

test("转换有序、无序、嵌套和任务列表", () => {
  const root = element("div", {}, [
    element("ul", {}, [
      element("li", {}, [text("项目"), element("ul", {}, [element("li", {}, [text("子项")])])]),
      element("li", {}, [element("input", { type: "checkbox", checked: "" }), text("完成")]),
    ]),
    element("ol", {}, [element("li", {}, [text("第一步")])]),
  ]);
  const result = convertArticle(root, options);
  assert.match(result.markdown, /- 项目\n  - 子项/);
  assert.match(result.markdown, /- \[x\] 完成/);
  assert.match(result.markdown, /1\. 第一步/);
});

test("输出表格与图片占位", () => {
  const root = element("div", {}, [
    element("table", {}, [
      element("thead", {}, [element("tr", {}, [element("th", {}, [text("A")]), element("th", {}, [text("B")])])]),
      element("tbody", {}, [element("tr", {}, [element("td", {}, [text("1")]), element("td", {}, [text("2|3")])])]),
    ]),
    element("p", {}, [element("img", { src: "https://x.feishu.cn/image/a", alt: "示意图" })]),
  ]);
  const result = convertArticle(root, options);
  assert.deepEqual(result.images, [{ id: 1, src: "https://x.feishu.cn/image/a", alt: "示意图" }]);
  assert.match(result.markdown, /\| A \| B \|\n\| --- \| --- \|\n\| 1 \| 2\\\|3 \|/);
  assert.match(result.markdown, /@@FEISHU_IMAGE_1@@/);
});

test("转义 Markdown 文本并安全处理缺失链接", () => {
  const root = element("div", {}, [
    element("p", {}, [text("*星号* [括号] #标签")]),
    element("a", {}, [text("无地址")]),
    element("code", {}, [text("a`b")]),
  ]);
  const result = convertArticle(root, options);
  assert.ok(result.markdown.includes("\\*星号\\* \\[括号\\] \\#标签"));
  assert.match(result.markdown, /无地址/);
  assert.match(result.markdown, /`` a`b ``/);
});
