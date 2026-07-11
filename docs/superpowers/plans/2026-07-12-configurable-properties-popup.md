# 可配置属性的 Obsidian 风格弹窗实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将插件弹窗改造成 Obsidian 风格的深色属性编辑器，支持任意属性模板、五种数据类型和保存前临时编辑，并保持现有正文及图片保存能力。

**Architecture:** 新增一个不依赖 DOM 与 Chrome API 的属性领域模块，集中负责默认模板、实例化、类型转换、校验和 YAML 序列化。`markdown.js` 只负责正文 Markdown，`popup.js` 管理编辑态、模板草稿、Chrome 存储和 Vault 保存编排，`popup.html` 与 `popup.css` 承载主编辑页和模板设置页。

**Tech Stack:** Chrome Extension Manifest V3、原生 ES Modules、原生 DOM/CSS、File System Access API、Chrome Storage API、Node.js 20+ 原生测试运行器。

## Global Constraints

- 项目文档和用户可见文案使用中文。
- 不新增运行时依赖或构建步骤。
- 弹窗约 420px 宽，深色单栏布局，无横向溢出，底部操作区保持可用。
- 属性类型仅包含 `text`、`list`、`date`、`boolean`、`number`。
- 本次临时编辑不得写回模板；模板仅在用户明确保存时持久化。
- 空文本、空日期和空列表仍写入 YAML。
- 正文提取、图片本地化、Vault 授权、目录校验和同名文件防覆盖不得回退。
- 不实现多个命名模板、正文编辑、Obsidian 属性定义同步或复杂飞书嵌入。

## 文件结构

- Create: `src/properties.js` — 属性模板、实例化、类型转换、校验和 YAML 序列化的纯函数。
- Create: `tests/properties.test.js` — 属性领域模块的单元测试。
- Modify: `src/markdown.js` — 将固定 frontmatter 移出，只接收已序列化的 frontmatter。
- Modify: `tests/markdown.test.js` — 验证外部 frontmatter 与正文转换组合。
- Modify: `popup.html` — 主编辑页、模板设置页和固定底部操作区。
- Modify: `popup.css` — 深色视觉、属性控件、设置页、滚动和错误状态。
- Modify: `src/popup.js` — 编辑状态、模板草稿、渲染、事件和保存编排。
- Modify: `tests/manual-checklist.md` — 新界面和属性模板的浏览器验收项。
- Modify: `README.md` — 更新功能、使用方法与保存结果示例。

---

### Task 1: 属性领域模块

**Files:**
- Create: `src/properties.js`
- Create: `tests/properties.test.js`

**Interfaces:**
- Consumes: 文章上下文 `{ title: string, url: string, createdDate: string }`。
- Produces: `createDefaultTemplate()`、`instantiateProperties(template, context)`、`coercePropertyValue(type, value)`、`validateProperties(properties)`、`serializeFrontmatter(properties)`、`cloneProperties(properties)`。

- [ ] **Step 1: 为默认模板、实例化与副本隔离编写失败测试**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  cloneProperties,
  createDefaultTemplate,
  instantiateProperties,
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

test("临时属性副本不会污染模板", () => {
  const template = createDefaultTemplate();
  const properties = instantiateProperties(template, { title: "A", url: "", createdDate: "2026-07-12" });
  properties[0].value = "B";
  const cloned = cloneProperties(properties);
  cloned[6].value.push("changed");
  assert.equal(template[0].defaultValue, "");
  assert.deepEqual(properties[6].value, ["clippings"]);
});
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run: `node --test tests/properties.test.js`

Expected: FAIL，错误包含 `ERR_MODULE_NOT_FOUND`，因为 `src/properties.js` 尚不存在。

- [ ] **Step 3: 实现模板、实例化和深拷贝的最小版本**

```js
const DEFAULT_TEMPLATE = [
  ["title", "text", "title", ""],
  ["source", "text", "url", ""],
  ["author", "list", "none", []],
  ["published", "date", "none", ""],
  ["created", "date", "createdDate", ""],
  ["description", "text", "none", ""],
  ["tags", "list", "none", ["clippings"]],
];

export function createDefaultTemplate() {
  return DEFAULT_TEMPLATE.map(([key, type, source, defaultValue], index) => ({
    id: `default-${index + 1}`,
    key,
    label: key,
    type,
    source,
    defaultValue: cloneValue(defaultValue),
    enabled: true,
  }));
}

export function instantiateProperties(template, context = {}) {
  return cloneProperties(template)
    .filter((field) => field.enabled !== false)
    .map((field) => ({
      id: field.id,
      key: String(field.key ?? ""),
      label: String(field.label || field.key || ""),
      type: field.type,
      value: cloneValue(sourceValue(field, context)),
    }));
}

export function cloneProperties(properties) {
  return (properties ?? []).map((field) => ({
    ...field,
    defaultValue: cloneValue(field.defaultValue),
    value: cloneValue(field.value),
  }));
}

function sourceValue(field, context) {
  const automatic = {
    title: context.title,
    url: context.url,
    createdDate: context.createdDate,
  }[field.source];
  return automatic === undefined || automatic === "" ? field.defaultValue : automatic;
}

function cloneValue(value) {
  return Array.isArray(value) ? [...value] : value;
}
```

- [ ] **Step 4: 运行测试确认默认模板行为通过**

Run: `node --test tests/properties.test.js`

Expected: 2 tests PASS。

- [ ] **Step 5: 为五种类型转换、字段校验和 YAML 输出编写失败测试**

```js
import {
  coercePropertyValue,
  serializeFrontmatter,
  validateProperties,
} from "../src/properties.js";

test("转换五种属性类型", () => {
  assert.equal(coercePropertyValue("text", 12), "12");
  assert.deepEqual(coercePropertyValue("list", "a, b\nc"), ["a", "b", "c"]);
  assert.equal(coercePropertyValue("date", "2026-07-12"), "2026-07-12");
  assert.equal(coercePropertyValue("boolean", "false"), false);
  assert.equal(coercePropertyValue("number", "-1.5"), -1.5);
  assert.throws(() => coercePropertyValue("date", "2026-02-30"), /日期/);
  assert.throws(() => coercePropertyValue("number", "Infinity"), /数字/);
});

test("拒绝空字段名、重复字段名和控制字符", () => {
  assert.deepEqual(validateProperties([{ key: "", type: "text", value: "" }])[0].code, "empty-key");
  assert.deepEqual(validateProperties([
    { key: "tag", type: "text", value: "" },
    { key: "tag", type: "text", value: "" },
  ])[1].code, "duplicate-key");
  assert.deepEqual(validateProperties([{ key: "bad\nkey", type: "text", value: "" }])[0].code, "control-character");
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
```

- [ ] **Step 6: 运行新增测试并确认失败原因是接口未实现**

Run: `node --test tests/properties.test.js`

Expected: FAIL，错误指出缺少命名导出或函数未定义。

- [ ] **Step 7: 实现类型转换、校验和 YAML 序列化**

```js
import { escapeYamlString } from "./path-utils.js";

const PROPERTY_TYPES = new Set(["text", "list", "date", "boolean", "number"]);

export function coercePropertyValue(type, value) {
  if (!PROPERTY_TYPES.has(type)) throw new Error(`不支持的属性类型：${type}`);
  if (type === "text") return String(value ?? "");
  if (type === "list") {
    const values = Array.isArray(value) ? value : String(value ?? "").split(/[,\n]/);
    return values.map((item) => String(item).trim()).filter(Boolean);
  }
  if (type === "date") {
    const date = String(value ?? "").trim();
    if (!date) return "";
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const parsed = match && new Date(`${date}T00:00:00Z`);
    if (!match || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new Error("日期必须是有效的 YYYY-MM-DD");
    }
    return date;
  }
  if (type === "boolean") {
    if (value === true || value === "true") return true;
    if (value === false || value === "false") return false;
    throw new Error("布尔值只能是 true 或 false");
  }
  if (value === "" || value === null || value === undefined) return "";
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("请输入有效数字");
  return number;
}

export function validateProperties(properties) {
  const seen = new Set();
  return (properties ?? []).map((field) => {
    const key = String(field.key ?? "").trim();
    let code = "";
    let message = "";
    if (!key) [code, message] = ["empty-key", "属性名不能为空"];
    else if (/\p{Cc}/u.test(key)) [code, message] = ["control-character", "属性名不能包含控制字符"];
    else if (seen.has(key)) [code, message] = ["duplicate-key", "属性名不能重复"];
    else if (!PROPERTY_TYPES.has(field.type)) [code, message] = ["invalid-type", "属性类型无效"];
    else {
      try { coercePropertyValue(field.type, field.value); } catch (error) {
        [code, message] = ["invalid-value", error.message];
      }
    }
    if (key) seen.add(key);
    return code ? { id: field.id, key, code, message } : null;
  }).filter(Boolean);
}

export function serializeFrontmatter(properties) {
  const errors = validateProperties(properties);
  if (errors.length) throw new Error(errors[0].message);
  const lines = ["---"];
  for (const field of properties) {
    const key = escapeYamlString(String(field.key).trim());
    const value = coercePropertyValue(field.type, field.value);
    if (field.type === "list") {
      lines.push(value.length ? `${key}:` : `${key}: []`);
      value.forEach((item) => lines.push(`  - ${escapeYamlString(item)}`));
    } else if (field.type === "boolean" || (field.type === "number" && value !== "")) {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: ${escapeYamlString(value)}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}
```

- [ ] **Step 8: 运行属性测试并确认全部通过**

Run: `node --test tests/properties.test.js`

Expected: 5 tests PASS，0 FAIL。

- [ ] **Step 9: 提交属性领域模块**

```bash
git add src/properties.js tests/properties.test.js
git commit -m "feat: add configurable property model"
```

### Task 2: 将可配置 frontmatter 接入 Markdown 转换

**Files:**
- Modify: `src/markdown.js`
- Modify: `tests/markdown.test.js`

**Interfaces:**
- Consumes: `convertArticle(root, { title: string, frontmatter: string })`。
- Produces: `{ markdown: string, images: Array<{ id, src, alt, cacheId? }> }`，其中 Markdown 以传入的 frontmatter 开头。

- [ ] **Step 1: 修改 Markdown 测试以描述新接口**

```js
const options = {
  title: '测试 "文档"',
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
```

- [ ] **Step 2: 运行测试确认旧固定 frontmatter 导致失败**

Run: `node --test tests/markdown.test.js`

Expected: FAIL，首个测试仍输出 `captured_at` 和 `source_type`，且没有使用 `options.frontmatter`。

- [ ] **Step 3: 让正文转换器使用外部 frontmatter**

```js
export function convertArticle(root, options) {
  const title = String(options?.title ?? "未命名笔记").replace(/\p{Cf}/gu, "").trim() || "未命名笔记";
  const images = [];
  const context = { images };
  const body = renderChildren(root, context, { block: true })
    .replace(/\p{Cf}/gu, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const frontmatter = String(options?.frontmatter ?? "").trim();
  const headingAndBody = `# ${escapeInline(title)}${body ? `\n\n${body}` : ""}\n`;
  return { markdown: frontmatter ? `${frontmatter}\n\n${headingAndBody}` : headingAndBody, images };
}
```

同时删除 `markdown.js` 顶部不再使用的 `escapeYamlString` 导入。

- [ ] **Step 4: 运行 Markdown 与属性测试**

Run: `node --test tests/markdown.test.js tests/properties.test.js`

Expected: 全部 PASS，0 FAIL。

- [ ] **Step 5: 提交 Markdown 接口调整**

```bash
git add src/markdown.js tests/markdown.test.js
git commit -m "refactor: inject article frontmatter"
```

### Task 3: 构建主编辑页和模板设置页

**Files:**
- Modify: `popup.html`
- Modify: `popup.css`

**Interfaces:**
- Consumes: `popup.js` 通过固定 ID 查找页面节点。
- Produces: `#editor-view`、`#settings-view`、`#properties-list`、`#template-properties-list`、`#document-title`、`#article-preview`、`#note-directory`、`#attachment-directory`、`#primary-button`、`#status` 等 DOM 节点。

- [ ] **Step 1: 将弹窗结构替换为双视图和固定底部操作区**

`popup.html` 使用以下结构；所有按钮声明 `type="button"`，图标按钮包含中文 `aria-label`：

```html
<main class="app-shell">
  <section id="editor-view" class="view">
    <header class="toolbar">
      <strong>Default</strong>
      <button id="open-settings" class="icon-button" type="button" aria-label="打开模板设置">⚙</button>
    </header>
    <div class="editor-scroll">
      <textarea id="document-title" class="title-input" rows="2" aria-label="文章标题"></textarea>
      <section class="properties-section" aria-labelledby="properties-heading">
        <h2 id="properties-heading">属性</h2>
        <div id="properties-list" class="properties-list"></div>
        <button id="add-property" class="add-property" type="button">＋ 添加属性</button>
      </section>
      <section class="preview-section" aria-labelledby="preview-heading">
        <h2 id="preview-heading">正文预览</h2>
        <pre id="article-preview">正在读取当前页面…</pre>
      </section>
    </div>
  </section>

  <section id="settings-view" class="view" hidden>
    <header class="toolbar settings-toolbar">
      <button id="cancel-settings" class="icon-button" type="button" aria-label="返回编辑页">←</button>
      <strong>Default 模板设置</strong>
      <button id="save-settings" class="text-button" type="button">保存</button>
    </header>
    <div class="settings-scroll">
      <section class="settings-group">
        <h2>默认属性</h2>
        <div id="template-properties-list" class="template-properties-list"></div>
        <button id="add-template-property" class="add-property" type="button">＋ 添加默认属性</button>
      </section>
      <section class="settings-group">
        <h2>保存位置</h2>
        <label><span>笔记目录</span><input id="note-directory" type="text" placeholder="Vault 根目录"></label>
        <label><span>附件目录</span><input id="attachment-directory" type="text" value="attachments/feishu"></label>
        <div class="vault-row"><span>Vault</span><strong id="vault-name">尚未选择</strong></div>
        <button id="change-vault" class="secondary-button" type="button">重新选择 Vault</button>
      </section>
    </div>
  </section>

  <footer class="action-dock">
    <div id="status" class="status" role="status" aria-live="polite"></div>
    <input id="quick-note-directory" type="text" aria-label="笔记目录" placeholder="Vault 根目录">
    <button id="primary-button" class="primary" type="button">添加到 Obsidian</button>
  </footer>
</main>
```

- [ ] **Step 2: 添加与参考图一致的深色布局基础样式**

`popup.css` 至少包含以下布局约束，其余控件沿用相同颜色变量：

```css
:root {
  color-scheme: dark;
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
  color: #dedede;
  background: #1e1e1e;
  --panel: #1e1e1e;
  --surface: #262626;
  --border: #343434;
  --muted: #a7a7a7;
  --accent: #8854f3;
  --danger: #ff7b72;
}
* { box-sizing: border-box; }
body { width: 420px; min-height: 540px; max-height: 760px; margin: 0; overflow: hidden; background: var(--panel); }
button, input, textarea, select { font: inherit; }
.app-shell { display: grid; grid-template-rows: minmax(0, 1fr) auto; height: min(760px, 100vh); }
.view { min-height: 0; overflow: hidden; }
.toolbar { display: flex; min-height: 56px; align-items: center; justify-content: space-between; padding: 0 18px; border-bottom: 1px solid var(--border); }
.editor-scroll, .settings-scroll { height: 100%; overflow-y: auto; padding: 18px 20px 120px; }
.title-input { width: 100%; resize: none; border: 0; color: #e8e8e8; background: transparent; font-size: 21px; font-weight: 750; line-height: 1.45; }
.properties-list { display: grid; gap: 6px; }
.property-row { display: grid; grid-template-columns: 24px 112px minmax(0, 1fr) 28px; gap: 8px; align-items: center; min-height: 38px; }
.property-row input, .property-row select, .settings-group input, .settings-group select, #quick-note-directory { min-width: 0; border: 1px solid transparent; border-radius: 7px; color: #dedede; background: transparent; }
.property-row input:focus, .property-row select:focus, .settings-group input:focus, #quick-note-directory:focus { border-color: #6f4bc3; outline: none; background: #262626; }
#article-preview { max-height: 210px; overflow: auto; white-space: pre-wrap; color: #d7d7d7; font-family: inherit; line-height: 1.7; }
.action-dock { position: relative; z-index: 3; display: grid; gap: 9px; padding: 10px 14px 14px; border-top: 1px solid var(--border); background: rgba(30, 30, 30, 0.98); }
.primary { min-height: 46px; border: 0; border-radius: 10px; color: white; background: var(--accent); font-size: 16px; font-weight: 750; }
.status { min-height: 18px; color: var(--muted); font-size: 12px; }
.status.error, .field-error { color: var(--danger); }
[hidden] { display: none !important; }
```

- [ ] **Step 3: 使用静态检查验证结构与样式没有语法或旧节点残留**

Run: `rg -n "destination|permission-badge|class=\"settings\"" popup.html popup.css`

Expected: 无输出。

Run: `rg -n "editor-view|settings-view|properties-list|template-properties-list|action-dock" popup.html popup.css`

Expected: 每个关键结构至少匹配一次。

- [ ] **Step 4: 提交界面骨架**

```bash
git add popup.html popup.css
git commit -m "feat: add Obsidian style popup layout"
```

### Task 4: 接入属性编辑、模板设置和保存流程

**Files:**
- Modify: `src/popup.js`

**Interfaces:**
- Consumes: Task 1 的属性纯函数、Task 2 的 `convertArticle(root, { title, frontmatter })`、现有 Vault 和目录接口。
- Produces: 可编辑属性列表、模板设置页、Chrome Storage 持久化和带自定义 YAML 的真实 Vault 保存流程。

- [ ] **Step 1: 扩展弹窗状态并在初始化时载入模板**

在 `popup.js` 导入：

```js
import {
  cloneProperties,
  coercePropertyValue,
  createDefaultTemplate,
  instantiateProperties,
  serializeFrontmatter,
  validateProperties,
} from "./properties.js";
```

状态和初始化使用以下字段与存储键：

```js
const state = {
  tab: null,
  vaultHandle: null,
  permission: "denied",
  busy: false,
  article: null,
  template: [],
  templateDraft: [],
  properties: [],
  settingsOpen: false,
};

const settings = await chrome.storage.local.get({
  noteDirectory: "raw/01-articles",
  attachmentDirectory: "attachments/feishu",
  propertyTemplate: createDefaultTemplate(),
});
state.template = cloneProperties(settings.propertyTemplate);
state.properties = instantiateProperties(state.template, {
  title: tab?.title || "",
  url: tab?.url || "",
  createdDate: localDate(),
});
```

`localDate(date = new Date())` 使用本地年月日拼成 `YYYY-MM-DD`，不得使用可能跨时区偏移的 `toISOString().slice(0, 10)`。

- [ ] **Step 2: 提取文章并渲染正文预览**

初始化完成且当前 URL 受支持时调用轻量预览读取：

```js
async function loadArticlePreview() {
  try {
    const extracted = await sendToCurrentTab({ type: "EXTRACT_ARTICLE" });
    if (!extracted?.ok) throw new Error(extracted?.error || "读取飞书正文失败");
    state.article = extracted.article;
    const titleField = state.properties.find((field) => field.key === "title");
    if (titleField && titleField.value === state.tab?.title) titleField.value = extracted.article.title;
    elements.title.value = extracted.article.title || state.tab?.title || "";
    elements.preview.textContent = htmlToPreviewText(extracted.article.html);
    renderProperties();
  } catch (error) {
    elements.preview.textContent = "暂时无法读取正文预览。";
    showStatus(errorMessage(error), "error");
  }
}

function htmlToPreviewText(html) {
  const document = new DOMParser().parseFromString(`<div>${html || ""}</div>`, "text/html");
  return document.body.textContent.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() || "正文为空";
}
```

- [ ] **Step 3: 实现当前文章属性渲染与事件委托**

属性行使用 `data-id` 关联状态；列表、日期、布尔和数字显示对应控件：

```js
function renderProperties() {
  elements.propertiesList.replaceChildren(...state.properties.map(createPropertyRow));
}

function createPropertyRow(field) {
  const row = document.createElement("div");
  row.className = "property-row";
  row.dataset.id = field.id;
  row.innerHTML = `
    <span class="type-icon" aria-hidden="true">${typeIcon(field.type)}</span>
    <input class="property-key" aria-label="属性名" value="${escapeHtml(field.key)}">
    ${propertyValueControl(field)}
    <button class="property-menu" type="button" aria-label="属性操作">⋯</button>
    <div class="field-error" hidden></div>`;
  return row;
}

elements.propertiesList.addEventListener("change", (event) => {
  const row = event.target.closest(".property-row");
  const field = state.properties.find((item) => item.id === row?.dataset.id);
  if (!field) return;
  if (event.target.classList.contains("property-key")) field.key = event.target.value.trim();
  if (event.target.classList.contains("property-value")) {
    try { field.value = coercePropertyValue(field.type, event.target.type === "checkbox" ? event.target.checked : event.target.value); }
    catch (error) { showFieldError(row, error.message); return; }
  }
  clearFieldError(row);
});
```

属性菜单采用原生 `<select aria-label="属性类型">` 加上上移、下移和删除按钮，避免引入浮层库。新增属性创建唯一 `id`、默认 `key: "property"`、`type: "text"` 和空值；若字段名已存在则依次尝试 `property_2`、`property_3`。

- [ ] **Step 4: 实现模板草稿页及持久化边界**

打开、取消和保存使用明确的副本：

```js
function openSettings() {
  state.templateDraft = cloneProperties(state.template);
  state.settingsOpen = true;
  renderTemplateProperties();
  updateView();
}

function cancelSettings() {
  state.templateDraft = [];
  state.settingsOpen = false;
  updateView();
}

async function saveTemplateSettings() {
  const draftProperties = state.templateDraft.map((field) => ({ ...field, value: field.defaultValue }));
  const errors = validateProperties(draftProperties);
  if (errors.length) {
    showStatus(errors[0].message, "error");
    focusTemplateField(errors[0].id);
    return;
  }
  parseRelativeDirectory(elements.noteDirectory.value);
  parseRelativeDirectory(elements.attachmentDirectory.value);
  state.template = cloneProperties(state.templateDraft);
  await chrome.storage.local.set({
    propertyTemplate: state.template,
    noteDirectory: elements.noteDirectory.value.trim(),
    attachmentDirectory: elements.attachmentDirectory.value.trim(),
  });
  state.settingsOpen = false;
  updateView();
  showStatus("模板设置已保存。", "success");
}
```

模板行编辑支持 `key`、`label`、`type`、`source`、`defaultValue`、`enabled`、上移、下移和删除。类型改变时调用 `coercePropertyValue`；无法转换时使用该类型空值并提示“原值无法转换，已清空”。取消设置不得调用 `chrome.storage.local.set`。

- [ ] **Step 5: 将标题、快速目录和设置目录保持同步**

```js
elements.title.addEventListener("input", () => {
  const titleField = state.properties.find((field) => field.key === "title");
  if (titleField) titleField.value = elements.title.value;
  renderProperties();
});

elements.quickNoteDirectory.addEventListener("input", () => {
  elements.noteDirectory.value = elements.quickNoteDirectory.value;
});

elements.noteDirectory.addEventListener("input", () => {
  elements.quickNoteDirectory.value = elements.noteDirectory.value;
});
```

标题属性被改名或删除后，标题输入框只控制文件名和 Markdown 一级标题，不自动重建 `title` 属性。

- [ ] **Step 6: 在保存前校验属性并注入 frontmatter**

`saveCurrentArticle()` 在任何图片读取和文件创建前执行：

```js
const errors = validateProperties(state.properties);
renderPropertyErrors(errors);
if (errors.length) {
  focusPropertyField(errors[0].id);
  throw new Error(errors[0].message);
}
const title = elements.title.value.replace(/\p{Cf}/gu, "").trim() || "未命名笔记";
const frontmatter = serializeFrontmatter(state.properties);
const extracted = state.article
  ? { ok: true, article: state.article }
  : await sendToCurrentTab({ type: "EXTRACT_ARTICLE" });
if (!extracted?.ok) throw new Error(extracted?.error || "读取飞书正文失败");
const parsed = new DOMParser().parseFromString(`<div>${extracted.article.html}</div>`, "text/html");
const root = parsed.body.firstElementChild;
if (!root) throw new Error("飞书正文结构为空");
const converted = convertArticle(root, { title, frontmatter });
```

传给 `saveArticleToVault` 的 `article.title` 使用上述回退后的 `title`，目录使用设置页/快速目录同步后的值。图片循环与 `CLEAR_IMAGE_CACHE` 的 `finally` 行为保持现状。

- [ ] **Step 7: 更新按钮、权限和双视图状态**

```js
function updateView() {
  elements.editorView.hidden = state.settingsOpen;
  elements.settingsView.hidden = !state.settingsOpen;
  elements.actionDock.hidden = state.settingsOpen;
}

function updateUi() {
  updateView();
  elements.vaultName.textContent = state.vaultHandle?.name || "尚未选择";
  if (!state.vaultHandle) elements.primary.textContent = "选择 Obsidian Vault";
  else if (state.permission !== "granted") elements.primary.textContent = "恢复 Vault 授权";
  else elements.primary.textContent = state.busy ? "正在保存…" : "添加到 Obsidian";
  elements.primary.disabled = state.busy || (state.vaultHandle && state.permission === "granted" && !validateFeishuUrl(state.tab?.url));
}
```

设置页关闭底部操作区，避免“保存模板”和“保存文章”同时出现。所有异步操作进入 `busy` 状态时禁用会产生写入或授权的按钮。

- [ ] **Step 8: 运行脚本语法检查和全部自动测试**

Run: `node --check src/*.js`

Expected: 无输出，退出码 0。

Run: `npm test`

Expected: 全部测试 PASS，0 FAIL。

- [ ] **Step 9: 提交弹窗行为**

```bash
git add src/popup.js
git commit -m "feat: add property editing and template settings"
```

### Task 5: 文档、人工验收与最终回归

**Files:**
- Modify: `tests/manual-checklist.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: 完成后的插件行为。
- Produces: 可复现的安装、配置、保存和验收说明。

- [ ] **Step 1: 更新浏览器人工验收清单**

将旧的固定 YAML 验收项替换为：

```markdown
## 属性与模板

- [ ] 默认显示 `title/source/author/published/created/description/tags` 七个属性。
- [ ] `title`、`source`、`created` 和 `tags` 自动获得当前文章值。
- [ ] 文本、列表、日期、布尔值和数字均可新增、编辑和保存。
- [ ] 属性可以改名、删除、上移、下移和切换类型。
- [ ] 空文本、空日期和空列表仍出现在 Obsidian Properties 中。
- [ ] 字段名为空、重复或包含换行时阻止保存并定位错误字段。
- [ ] 模板保存后重开弹窗仍存在；取消模板编辑后重开时不存在未保存修改。
- [ ] 单篇文章的临时属性修改不会改变下次打开时的模板默认值。
- [ ] Obsidian 将列表、日期、布尔和数字识别为对应类型。
```

同时保留现有正文格式、虚拟滚动、图片、同名文件、授权和错误路径验收项。

- [ ] **Step 2: 更新 README 的功能、使用和示例**

README 明确说明：

```markdown
- 弹窗采用 Obsidian 风格的属性编辑界面，保存前可修改本篇文章属性。
- 默认模板可新增任意字段，并支持文本、列表、日期、布尔值和数字。
- 模板设置保存在浏览器本地；本篇临时修改不会改变模板。
```

保存示例移除固定 `captured_at` 和 `source_type`，展示 `created`、`tags`、布尔和数字的 YAML 类型。

- [ ] **Step 3: 运行自动回归与差异检查**

Run: `npm test`

Expected: 全部测试 PASS，0 FAIL。

Run: `node --check src/*.js`

Expected: 无输出，退出码 0。

Run: `git diff --check`

Expected: 无输出，退出码 0。

- [ ] **Step 4: 在 Chrome 中执行人工验收**

按照 `tests/manual-checklist.md` 加载未打包扩展，至少使用一个真实飞书 Wiki 文档和一个测试 Vault。记录 Chrome 版本、系统版本、URL 类型、通过项和未通过项。

Expected: 属性与模板、授权与设置、正文与格式、文件与图片、错误路径全部通过；任何无法在当前环境验证的项目必须在交付说明中列为风险，不得宣称通过。

- [ ] **Step 5: 提交文档和验收清单**

```bash
git add README.md tests/manual-checklist.md
git commit -m "docs: document configurable clipping properties"
```

- [ ] **Step 6: 最终工作区自检**

Run: `git status --short`

Expected: 无输出。

Run: `git log --oneline -5`

Expected: 顶部包含本计划产生的属性模块、Markdown 接口、界面、交互和文档提交。
