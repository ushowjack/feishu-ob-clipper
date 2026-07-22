import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function cssRule(css, selector) {
  const normalizedCss = css.replace(/\r\n/g, "\n");
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return normalizedCss.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`))?.[1] || "";
}

test("弹窗使用财摘品牌和多站点文章文案", async () => {
  const [html, popupScript] = await Promise.all([
    readFile(new URL("../popup.html", import.meta.url), "utf8"),
    readFile(new URL("../src/popup.js", import.meta.url), "utf8"),
  ]);

  assert.match(html, /<title>财摘<\/title>/);
  assert.match(html, /class="brand-name">财摘<\/strong>/);
  assert.doesNotMatch(html, /飞摘|attachments\/(?:feishu|scys)/);
  assert.match(popupScript, /请打开受支持的飞书文档或生财文章/);
  assert.doesNotMatch(popupScript, /validate(?:Feishu|Scys)Url/);
});

test("保存结果提示允许完整换行并限制最大高度", async () => {
  const css = await readFile(new URL("../popup.css", import.meta.url), "utf8");
  const statusRule = cssRule(css, ".status");

  assert.match(statusRule, /white-space:\s*normal/);
  assert.match(statusRule, /overflow-wrap:\s*anywhere/);
  assert.match(statusRule, /max-height:/);
  assert.match(statusRule, /overflow-y:\s*auto/);
});

test("主编辑页使用协调的文字层级和间距标尺", async () => {
  const css = await readFile(new URL("../popup.css", import.meta.url), "utf8");
  const popupScript = await readFile(new URL("../src/popup.js", import.meta.url), "utf8");

  assert.match(cssRule(css, ".editor-scroll"), /padding:\s*16px 18px/);
  assert.match(cssRule(css, ".title-input"), /font-size:\s*14px/);
  assert.match(cssRule(css, ".title-input"), /line-height:\s*1\.45/);
  assert.match(cssRule(css, ".title-input"), /min-height:\s*42px/);
  assert.match(popupScript, /Math\.max\(42, elements\.title\.scrollHeight\)/);
  assert.match(cssRule(css, ".property-row"), /min-height:\s*34px/);
  assert.match(cssRule(css, ".property-row input,\n.property-row select"), /padding-block:\s*5px/);
  assert.match(cssRule(css, ".property-row input,\n.property-row select,\n.setting-field input,\n.template-field input,\n.template-field select,\n#quick-note-directory"), /font-size:\s*13px/);
  assert.match(cssRule(css, ".primary"), /min-height:\s*48px/);
});

test("文字层级按品牌、文档、属性和操作区递进", async () => {
  const css = await readFile(new URL("../popup.css", import.meta.url), "utf8");

  assert.match(cssRule(css, ".brand-name"), /font-size:\s*15px/);
  assert.match(cssRule(css, ".brand-name"), /font-weight:\s*700/);
  assert.match(cssRule(css, ".template-name"), /font-size:\s*11px/);
  assert.match(cssRule(css, ".title-input"), /font-weight:\s*650/);
  assert.match(cssRule(css, ".section-title"), /font-size:\s*13px/);
  assert.match(cssRule(css, ".section-title"), /font-weight:\s*650/);
  assert.match(cssRule(css, ".property-key"), /font-weight:\s*500/);
  assert.match(cssRule(css, ".property-value"), /font-weight:\s*450/);
  assert.match(cssRule(css, ".primary"), /font-size:\s*15px/);
  assert.match(cssRule(css, ".primary"), /font-weight:\s*700/);
});

test("空状态不会占用底部操作区间距", async () => {
  const css = await readFile(new URL("../popup.css", import.meta.url), "utf8");

  assert.match(cssRule(css, ".status:empty"), /display:\s*none/);
});

test("主界面不渲染正文预览但仍保留文章提取流程", async () => {
  const [html, css, popupScript] = await Promise.all([
    readFile(new URL("../popup.html", import.meta.url), "utf8"),
    readFile(new URL("../popup.css", import.meta.url), "utf8"),
    readFile(new URL("../src/popup.js", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(html, /正文预览|article-preview|preview-section/);
  assert.doesNotMatch(css, /#article-preview|\.preview-section/);
  assert.doesNotMatch(popupScript, /elements\.preview|htmlToPreviewText/);
  assert.match(popupScript, /state\.article = extracted\.article/);
});

test("转换正文时传入生财原文地址供临时视频回退", async () => {
  const popupScript = await readFile(new URL("../src/popup.js", import.meta.url), "utf8");

  assert.match(popupScript, /source:\s*extracted\.article\.url/);
});

test("主编辑页使用完整高度且不产生内部滚动", async () => {
  const css = await readFile(new URL("../popup.css", import.meta.url), "utf8");
  const editorScroll = cssRule(css, ".editor-scroll");
  const settingsScroll = cssRule(css, ".settings-scroll");

  assert.match(cssRule(css, ".app-shell"), /height:\s*min\(720px, 100vh\)/);
  assert.match(cssRule(css, ".view"), /display:\s*grid/);
  assert.match(cssRule(css, ".view"), /grid-template-rows:\s*auto minmax\(0, 1fr\)/);
  assert.match(editorScroll, /min-height:\s*0/);
  assert.match(editorScroll, /overflow:\s*hidden/);
  assert.match(editorScroll, /padding:\s*16px 18px/);
  assert.doesNotMatch(editorScroll, /overflow-y:\s*auto|112px/);
  assert.match(settingsScroll, /overflow-y:\s*auto/);
});

test("长属性内容不会撑破弹窗布局", async () => {
  const css = await readFile(new URL("../popup.css", import.meta.url), "utf8");
  const controls = cssRule(css, ".property-row input,\n.property-row select,\n.setting-field input,\n.template-field input,\n.template-field select,\n#quick-note-directory");

  assert.match(cssRule(css, ".property-row"), /grid-template-columns:\s*20px 104px minmax\(0, 1fr\) 28px/);
  assert.match(controls, /text-overflow:\s*ellipsis/);
  assert.match(controls, /white-space:\s*nowrap/);
});
