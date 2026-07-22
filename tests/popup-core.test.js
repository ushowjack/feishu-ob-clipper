import test from "node:test";
import assert from "node:assert/strict";

import {
  dataUrlToBlob,
  localDate,
  localIsoTimestamp,
  nextPropertyKey,
  shouldPreserveStatus,
  validateSupportedArticleUrl,
} from "../src/popup-core.js";

test("只接受受支持的飞书文档和生财文章地址", () => {
  assert.equal(validateSupportedArticleUrl("https://example.feishu.cn/wiki/token"), true);
  assert.equal(validateSupportedArticleUrl("https://example.feishu.cn/docx/token"), true);
  assert.equal(validateSupportedArticleUrl("https://scys.com/articleDetail/xq_topic/45544285884128158"), true);
  assert.equal(validateSupportedArticleUrl("https://scys.com/activity"), false);
  assert.equal(validateSupportedArticleUrl("https://evil.example/articleDetail/xq_topic/1"), false);
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

test("使用本地年月日生成日期而不经过 UTC 截断", () => {
  assert.equal(localDate(new Date(2026, 6, 12, 23, 30)), "2026-07-12");
});

test("生成不重复的自定义属性名", () => {
  assert.equal(nextPropertyKey([{ key: "title" }]), "property");
  assert.equal(nextPropertyKey([{ key: "property" }, { key: "property_2" }]), "property_3");
});

test("界面刷新时保留错误、警告和成功状态", () => {
  assert.equal(shouldPreserveStatus("status error"), true);
  assert.equal(shouldPreserveStatus("status warning"), true);
  assert.equal(shouldPreserveStatus("status success"), true);
  assert.equal(shouldPreserveStatus("status"), false);
});
