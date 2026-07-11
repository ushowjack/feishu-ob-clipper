import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("保存结果提示允许完整换行并限制最大高度", async () => {
  const css = await readFile(new URL("../popup.css", import.meta.url), "utf8");
  const statusRule = css.match(/\.status\s*\{([\s\S]*?)\}/)?.[1] || "";

  assert.match(statusRule, /white-space:\s*normal/);
  assert.match(statusRule, /overflow-wrap:\s*anywhere/);
  assert.match(statusRule, /max-height:/);
  assert.match(statusRule, /overflow-y:\s*auto/);
});
