import test from "node:test";
import assert from "node:assert/strict";

import {
  cloneProperties,
  coercePropertyValue,
  createDefaultTemplate,
  instantiateProperties,
  serializeFrontmatter,
  validateProperties,
} from "../src/properties.js";

test("默认模板自动填入当前文章上下文", () => {
  const properties = instantiateProperties(createDefaultTemplate(), {
    title: "测试文章",
    url: "https://x.feishu.cn/wiki/a",
    createdDate: "2026-07-12",
  });

  assert.deepEqual(properties.map(({ key, type, value }) => ({ key, type, value })), [
    { key: "title", type: "text", value: "测试文章" },
    { key: "source", type: "text", value: "https://x.feishu.cn/wiki/a" },
    { key: "author", type: "list", value: [] },
    { key: "published", type: "date", value: "" },
    { key: "created", type: "date", value: "2026-07-12" },
    { key: "description", type: "text", value: "" },
    { key: "tags", type: "list", value: ["clippings"] },
  ]);
});

test("临时属性副本不会污染模板或原属性", () => {
  const template = createDefaultTemplate();
  const properties = instantiateProperties(template, {
    title: "A",
    url: "",
    createdDate: "2026-07-12",
  });
  properties[0].value = "B";
  const cloned = cloneProperties(properties);
  cloned[6].value.push("changed");

  assert.equal(template[0].defaultValue, "");
  assert.deepEqual(properties[6].value, ["clippings"]);
});

test("转换五种属性类型并拒绝非法值", () => {
  assert.equal(coercePropertyValue("text", 12), "12");
  assert.deepEqual(coercePropertyValue("list", "a, b\nc"), ["a", "b", "c"]);
  assert.equal(coercePropertyValue("date", "2026-07-12"), "2026-07-12");
  assert.equal(coercePropertyValue("boolean", "false"), false);
  assert.equal(coercePropertyValue("number", "-1.5"), -1.5);
  assert.throws(() => coercePropertyValue("date", "2026-02-30"), /日期/);
  assert.throws(() => coercePropertyValue("number", "Infinity"), /数字/);
});

test("拒绝空字段名、重复字段名和控制字符", () => {
  assert.equal(validateProperties([{ key: "", type: "text", value: "" }])[0].code, "empty-key");
  assert.equal(validateProperties([
    { key: "tag", type: "text", value: "" },
    { key: "tag", type: "text", value: "" },
  ])[0].code, "duplicate-key");
  assert.equal(validateProperties([{ key: "bad\nkey", type: "text", value: "" }])[0].code, "control-character");
});

test("按顺序输出 Obsidian 可识别的 YAML 类型和空值", () => {
  const yaml = serializeFrontmatter([
    { key: "title", type: "text", value: "带: 冒号和 \"引号\"" },
    { key: "tags", type: "list", value: ["clip", "中文"] },
    { key: "published", type: "date", value: "" },
    { key: "draft", type: "boolean", value: false },
    { key: "score", type: "number", value: 1.5 },
    { key: "empty", type: "list", value: [] },
  ]);

  assert.equal(yaml, [
    "---",
    "title: \"带: 冒号和 \\\"引号\\\"\"",
    "tags:",
    "  - \"clip\"",
    "  - \"中文\"",
    "published: \"\"",
    "draft: false",
    "score: 1.5",
    "empty: []",
    "---",
  ].join("\n"));
});
