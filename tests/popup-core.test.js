import test from "node:test";
import assert from "node:assert/strict";

import {
  dataUrlToBlob,
  localIsoTimestamp,
  validateFeishuUrl,
} from "../src/popup-core.js";

test("只接受飞书 HTTPS 文档地址", () => {
  assert.equal(validateFeishuUrl("https://a.feishu.cn/wiki/token"), true);
  assert.equal(validateFeishuUrl("https://a.feishu.cn/docx/token"), true);
  assert.equal(validateFeishuUrl("https://a.feishu.cn/docs/token"), true);
  assert.equal(validateFeishuUrl("https://evil.example/wiki/token"), false);
  assert.equal(validateFeishuUrl("https://feishu.cn.evil.example/wiki/token"), false);
  assert.equal(validateFeishuUrl("http://a.feishu.cn/wiki/token"), false);
});

test("把 base64 data URL 恢复为 Blob", async () => {
  const blob = dataUrlToBlob("data:image/png;base64,aGk=");
  assert.equal(blob.type, "image/png");
  assert.equal(await blob.text(), "hi");
});

test("把 URL 编码 data URL 恢复为 Blob", async () => {
  const blob = dataUrlToBlob("data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E");
  assert.equal(blob.type, "image/svg+xml");
  assert.equal(await blob.text(), "<svg></svg>");
});

test("拒绝无效 data URL", () => {
  assert.throws(() => dataUrlToBlob("https://example.com/image.png"), /data URL/);
});

test("生成包含本地时区偏移的 ISO 时间", () => {
  const value = localIsoTimestamp(new Date("2026-07-11T04:00:00.000Z"), -480);
  assert.equal(value, "2026-07-11T12:00:00+08:00");
});
