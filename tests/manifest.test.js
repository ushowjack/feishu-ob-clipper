import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("manifest 使用财摘品牌并引用存在的 PNG 图标", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

  assert.equal(manifest.name, "财摘：文章到 Obsidian");
  assert.equal(manifest.short_name, "财摘");
  assert.equal(manifest.action.default_title, "财摘");
  assert.equal(manifest.description, "把飞书文档和生财文章的正文及图片摘入 Obsidian Vault。");

  for (const [size, iconPath] of Object.entries(manifest.icons)) {
    assert.match(iconPath, new RegExp(`icon${size}\\.png$`));
    const bytes = await readFile(new URL(`../${iconPath}`, import.meta.url));
    assert.deepEqual(bytes.subarray(0, PNG_SIGNATURE.length), PNG_SIGNATURE);
  }

  assert.deepEqual(manifest.action.default_icon, manifest.icons);
  assert.deepEqual(manifest.host_permissions, ["https://*.feishu.cn/*", "https://scys.com/*"]);
  assert.deepEqual(manifest.content_scripts[0].matches, [
    "https://*.feishu.cn/wiki/*",
    "https://*.feishu.cn/docx/*",
    "https://*.feishu.cn/docs/*",
    "https://scys.com/articleDetail/*",
  ]);
  assert.deepEqual(manifest.web_accessible_resources[0].matches, [
    "https://*.feishu.cn/*",
    "https://scys.com/*",
  ]);
  assert.deepEqual(manifest.web_accessible_resources[0].resources, [
    "src/content-core.js",
    "src/feishu-site.js",
    "src/scys-site.js",
    "src/site-rules.js",
  ]);
});
