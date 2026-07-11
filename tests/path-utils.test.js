import test from "node:test";
import assert from "node:assert/strict";

import {
  escapeYamlString,
  nextAvailableName,
  parseRelativeDirectory,
  sanitizeFilename,
} from "../src/path-utils.js";

test("清理非法文件名并提供回退标题", () => {
  assert.equal(sanitizeFilename(' A/B:C*D?"<>|. '), "A B C D");
  assert.equal(sanitizeFilename("   "), "未命名飞书文档");
});

test("限制文件名长度并清理控制字符", () => {
  assert.equal(sanitizeFilename(`a\u0000${"中".repeat(130)}`).length, 120);
});

test("解析 Vault 内相对目录", () => {
  assert.deepEqual(parseRelativeDirectory("raw/01-articles"), ["raw", "01-articles"]);
  assert.deepEqual(parseRelativeDirectory(""), []);
  assert.deepEqual(parseRelativeDirectory("raw\\articles/2026"), ["raw", "articles", "2026"]);
});

test("拒绝绝对路径和越界路径", () => {
  assert.throws(() => parseRelativeDirectory("../secret"), /Vault/);
  assert.throws(() => parseRelativeDirectory("raw/../secret"), /Vault/);
  assert.throws(() => parseRelativeDirectory("/tmp"), /Vault/);
  assert.throws(() => parseRelativeDirectory("C:\\temp"), /Vault/);
});

test("同名文件自动递增", async () => {
  const existing = new Set(["标题.md", "标题-2.md"]);
  assert.equal(
    await nextAvailableName("标题", async (name) => existing.has(name)),
    "标题-3.md",
  );
});

test("同名递增达到上限时失败", async () => {
  await assert.rejects(
    nextAvailableName("标题", async () => true, 2),
    /过多同名文件/,
  );
});

test("YAML 双引号字符串安全转义", () => {
  assert.equal(escapeYamlString('a"b\\c\n'), '"a\\"b\\\\c\\n"');
});
