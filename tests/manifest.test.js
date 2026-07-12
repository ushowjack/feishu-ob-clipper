import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("manifest 使用飞摘品牌并引用存在的 PNG 图标", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

  assert.equal(manifest.name, "飞摘：飞书到 Obsidian");
  assert.equal(manifest.short_name, "飞摘");
  assert.equal(manifest.action.default_title, "飞摘");

  for (const [size, iconPath] of Object.entries(manifest.icons)) {
    assert.match(iconPath, new RegExp(`icon${size}\\.png$`));
    const bytes = await readFile(new URL(`../${iconPath}`, import.meta.url));
    assert.deepEqual(bytes.subarray(0, PNG_SIGNATURE.length), PNG_SIGNATURE);
  }

  assert.deepEqual(manifest.action.default_icon, manifest.icons);
});
