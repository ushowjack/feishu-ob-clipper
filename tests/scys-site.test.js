import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyScysBlock,
  extractScysMetadata,
} from "../src/scys-site.js";

test("识别生财内嵌飞书的标题、列表和表格块", () => {
  assert.deepEqual(
    classifyScysBlock({ className: "vc-doc-item doc-heading-block doc-heading-2" }),
    { kind: "heading", level: 2 },
  );
  assert.deepEqual(
    classifyScysBlock({ hasBullet: true }),
    { kind: "list-item", listTag: "ul" },
  );
  assert.deepEqual(
    classifyScysBlock({ hasOrder: true }),
    { kind: "list-item", listTag: "ol" },
  );
  assert.deepEqual(
    classifyScysBlock({ tableClass: "table table_3" }),
    { kind: "table", columns: 3 },
  );
});

test("提取生财完整标题和发布日期", () => {
  const elements = new Map([
    [".post-title--for-long-article, .post-title", {
      textContent: "用 Claude Code 67 天做出付费 SaaS：自己跑视频号 + 卖软件，一个人首次月入 10 万",
    }],
    [".post-item-top .date", { textContent: "2026-06-04 21:04" }],
  ]);
  const documentRef = {
    title: "被截短的浏览器标题",
    querySelector: (selector) => elements.get(selector) ?? null,
  };

  assert.deepEqual(extractScysMetadata(documentRef), {
    title: "用 Claude Code 67 天做出付费 SaaS：自己跑视频号 + 卖软件，一个人首次月入 10 万",
    publishedDate: "2026-06-04",
  });
});
