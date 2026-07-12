import test from "node:test";
import assert from "node:assert/strict";

import { convertArticle } from "../src/markdown.js";
import { element, text } from "./support/fake-dom.js";

const options = {
  title: '测试 "文档"',
  source: "https://x.feishu.cn/wiki/a",
  frontmatter: [
    "---",
    'title: "测试 \\\"文档\\\""',
    'source: "https://x.feishu.cn/wiki/a"',
    "tags:",
    '  - "clippings"',
    "---",
  ].join("\n"),
};

test("组合外部 YAML 元数据和文档标题", () => {
  const result = convertArticle(element("div", {}, [element("p", {}, [text("正文")])]), options);
  assert.ok(result.markdown.startsWith(`${options.frontmatter}\n\n`));
  assert.match(result.markdown, /# 测试 "文档"\n\n正文/);
  assert.doesNotMatch(result.markdown, /captured_at|source_type/);
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

test("把相邻 HTML 块级容器保留为独立段落", () => {
  const root = element("div", {}, [
    element("div", {}, [text("第一段")]),
    element("div", {}, [text("第二段")]),
  ]);

  const result = convertArticle(root, options);
  assert.match(result.markdown, /第一段\n\n第二段/);
});

test("保留显式换行和行内格式两侧空格", () => {
  const root = element("div", {}, [
    element("p", {}, [text("第一行"), element("br"), text("第二行")]),
    element("p", {}, [text("前文"), element("strong", {}, [text(" 中间 ")]), text("后文")]),
  ]);

  const result = convertArticle(root, options);
  assert.match(result.markdown, /第一行\\\n第二行/);
  assert.match(result.markdown, /前文 \*\*中间\*\* 后文/);
});

test("保留代码块内部连续空行", () => {
  const root = element("div", {}, [
    element("pre", {}, [element("code", { class: "language-text" }, [text("第一行\n\n\n第四行")])]),
  ]);

  const result = convertArticle(root, options);
  assert.match(result.markdown, /```text\n第一行\n\n\n第四行\n```/);
});

test("缩进列表项中的后续段落", () => {
  const root = element("div", {}, [
    element("ul", {}, [
      element("li", {}, [
        element("p", {}, [text("首段")]),
        element("p", {}, [text("次段")]),
      ]),
    ]),
  ]);

  const result = convertArticle(root, options);
  assert.match(result.markdown, /- 首段\n\n  次段/);
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

test("把飞书视频转换为可点击链接并避免丢失", () => {
  const header = element("div", { class: "preview-card-header" }, [text("注册教程@淘金")]);
  const video = element("video", {
    src: "https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/video/token/",
  });
  video.closest = (selector) => selector === ".preview-card-header" ? header : null;
  const result = convertArticle(element("div", {}, [element("div", {}, [header, video])]), options);
  assert.match(result.markdown, /\[视频：注册教程@淘金\]\(https:\/\/internal-api-drive-stream\.feishu\.cn\/space\/api\/box\/stream\/download\/video\/token\/\)/);
});

test("优先使用清理前保存的完整飞书视频文件名", () => {
  const video = element("video", {
    src: "https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/video/token/",
    "data-feishu-video-title": "Link3操作流程@生财有术.mp4",
  });

  const result = convertArticle(element("div", {}, [video]), options);

  assert.match(result.markdown, /\[视频：Link3操作流程@生财有术\.mp4\]\(/);
  assert.doesNotMatch(result.markdown, /飞书视频/);
});

test("blob 视频不输出离开飞书页面后必然失效的链接", () => {
  const video = element("video", {
    src: "blob:https://my.feishu.cn/transient-video",
    "data-feishu-video-title": "演示.mp4",
  });

  const result = convertArticle(element("div", {}, [video]), options);

  assert.match(result.markdown, /\[视频：演示\.mp4（打开飞书原文）\]\(https:\/\/x\.feishu\.cn\/wiki\/a\)/);
  assert.doesNotMatch(result.markdown, /blob:/);
});

test("读取 video 子 source 的持久视频地址", () => {
  const source = element("source", { src: "https://a.feishu.cn/space/api/video/source-token" });
  const video = element("video", { "data-feishu-video-title": "子源视频.mp4" }, [source]);
  video.querySelectorAll = (selector) => selector === "source[src],source[data-src]" ? [source] : [];

  const result = convertArticle(element("div", {}, [video]), options);

  assert.match(result.markdown, /\[视频：子源视频\.mp4\]\(https:\/\/a\.feishu\.cn\/space\/api\/video\/source-token\)/);
});

test("多个 video 子 source 中优先选择持久地址", () => {
  const blobSource = element("source", { src: "blob:https://my.feishu.cn/transient" });
  const stableSource = element("source", { src: "https://a.feishu.cn/space/api/video/stable-token" });
  const video = element("video", { "data-feishu-video-title": "多源视频.mp4" }, [blobSource, stableSource]);
  video.querySelectorAll = (selector) => selector === "source[src],source[data-src]"
    ? [blobSource, stableSource]
    : [];

  const result = convertArticle(element("div", {}, [video]), options);

  assert.match(result.markdown, /\[视频：多源视频\.mp4\]\(https:\/\/a\.feishu\.cn\/space\/api\/video\/stable-token\)/);
  assert.doesNotMatch(result.markdown, /blob:/);
});

test("把页面即时缓存标识传入图片下载清单", () => {
  const root = element("div", {}, [
    element("img", {
      src: "https://internal-api-drive-stream.feishu.cn/image",
      "data-feishu-cache-id": "record-1:0",
    }),
  ]);
  const result = convertArticle(root, options);
  assert.equal(result.images[0].cacheId, "record-1:0");
});

test("同一 blob 图片即使缓存标识不同也只生成一个下载项", () => {
  const src = "blob:https://my.feishu.cn/same-image";
  const root = element("div", {}, [
    element("img", { src, "data-feishu-cache-id": "record-1:0" }),
    element("img", { src, "data-feishu-cache-id": "record-2:3" }),
  ]);

  const result = convertArticle(root, options);

  assert.equal(result.images.length, 1);
  assert.equal(result.images[0].cacheId, "record-1:0");
});

test("同一飞书图片的不同尺寸地址只生成一个下载项", () => {
  const root = element("div", {}, [
    element("img", { src: "https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/preview/token-1/?preview_type=16" }),
    element("img", { src: "https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/preview/token-1/?preview_type=32" }),
  ]);
  const result = convertArticle(root, options);
  assert.equal(result.images.length, 1);
  assert.equal((result.markdown.match(/@@FEISHU_IMAGE_1@@/g) ?? []).length, 2);
});

test("查询参数承载图片身份时不把不同图片错误合并", () => {
  const root = element("div", {}, [
    element("img", { src: "https://x.feishu.cn/image.png?asset=A" }),
    element("img", { src: "https://x.feishu.cn/image.png?asset=B" }),
  ]);

  const result = convertArticle(root, options);

  assert.equal(result.images.length, 2);
  assert.match(result.markdown, /@@FEISHU_IMAGE_1@@.*@@FEISHU_IMAGE_2@@/s);
});

test("同一图片同时出现在普通正文和网格时使用不同渲染占位符", () => {
  const src = "https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/preview/token-1/?preview_type=16";
  const grid = layoutElement("div", "grid-block", [
    layoutElement("div", "block docx-grid_column-block", [element("img", { src })], "width: 50%;"),
  ]);
  const result = convertArticle(element("div", {}, [element("img", { src }), grid]), options);

  assert.equal(result.images.length, 1);
  assert.match(result.markdown, /@@FEISHU_IMAGE_1@@/);
  assert.match(result.markdown, /@@FEISHU_GRID_IMAGE_1@@/);
});

test("网格 HTML 与后续普通 Markdown 之间保留空行", () => {
  const grid = layoutElement("div", "grid-block", [
    layoutElement("div", "block docx-grid_column-block", [
      element("img", { src: "https://x/grid" }),
    ], "width: 50%;"),
  ]);
  const result = convertArticle(element("div", {}, [grid, element("img", { src: "https://x/normal" })]), options);

  assert.match(result.markdown, /<\/div>\n\n@@FEISHU_IMAGE_2@@/);
});

test("复刻飞书网格布局并保留大列小列比例", () => {
  const grid = layoutElement("div", "grid-block j-grid-block grid-horizontal", [
    layoutElement("div", "render-unit-wrapper grid-render-unit", [
      layoutElement("div", "block docx-grid_column-block", [
        element("p", {}, [element("img", { src: "https://x/image-large" })]),
      ], "flex-grow: 0; flex-shrink: 0; width: calc(66.6667% - 8px);"),
      layoutElement("div", "block docx-grid_column-block", [
        element("p", {}, [element("img", { src: "https://x/image-small" })]),
      ], "flex-grow: 0; flex-shrink: 0; width: calc(33.3333% - 8px);"),
    ]),
  ]);

  const result = convertArticle(element("div", {}, [grid]), options);

  assert.equal(result.images[0].layout, "grid");
  assert.equal(result.images[1].layout, "grid");
  assert.match(result.markdown, /class="feishu-image-grid"/);
  assert.match(result.markdown, /flex-basis:calc\(66\.6667% - 8px\)/);
  assert.match(result.markdown, /flex-basis:calc\(33\.3333% - 8px\)/);
  assert.ok(result.markdown.indexOf("@@FEISHU_GRID_IMAGE_1@@") < result.markdown.indexOf("@@FEISHU_GRID_IMAGE_2@@"));
});

test("Markdown 转换层不根据百分比数值猜测并删除正文", () => {
  const grid = layoutElement("div", "grid-block", [
    layoutElement("div", "block docx-grid_column-block", [
      element("p", {}, [element("img", { src: "https://x/image" })]),
      element("p", {}, [text("图1")]),
      element("p", {}, [text("17%")]),
    ], "width: 16.6667%;"),
  ]);

  const result = convertArticle(element("div", {}, [grid]), options);

  assert.match(result.markdown, /图1/);
  assert.match(result.markdown, /17%/);
});

test("网格列末尾的合法百分比正文与列宽不一致时予以保留", () => {
  const grid = layoutElement("div", "grid-block", [
    layoutElement("div", "block docx-grid_column-block", [
      element("p", {}, [element("img", { src: "https://x/image" })]),
      element("p", {}, [text("17%")]),
    ], "width: 50%;"),
  ]);

  const result = convertArticle(element("div", {}, [grid]), options);

  assert.match(result.markdown, /17%/);
});

test("移除飞书正文中的零宽格式字符", () => {
  const root = element("div", {}, [
    element("h2", {}, [text("五，小白如何快速上手\u200B")]),
    element("p", {}, [text("正文\u200E内容\uFEFF")]),
  ]);
  const result = convertArticle(root, { ...options, title: "测试标题\u200B" });
  assert.doesNotMatch(result.markdown, /\p{Cf}/u);
  assert.match(result.markdown, /小白如何快速上手/);
  assert.match(result.markdown, /正文内容/);
});

test("忽略只包含空白或零宽字符的标题", () => {
  const root = element("div", {}, [
    element("h1", {}, [text("\u200B")]),
    element("h5", {}, [text("   ")]),
    element("p", {}, [text("保留正文")]),
  ]);
  const result = convertArticle(root, options);
  assert.doesNotMatch(result.markdown, /^#{2,6}\s*$/m);
  assert.match(result.markdown, /保留正文/);
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

function layoutElement(tagName, className, children = [], style = "") {
  return element(tagName, { class: className, style }, children);
}
