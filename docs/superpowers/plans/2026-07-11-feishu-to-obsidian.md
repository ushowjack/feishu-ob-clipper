# 飞书正文保存到 Obsidian 插件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个可直接加载到 Chrome 的 Manifest V3 插件，把当前飞书 Wiki/文档正文和图片安全写入用户授权的 Obsidian Vault。

**Architecture:** 内容脚本只负责识别和读取当前飞书页面，并利用当前登录态获取图片；弹窗负责转换、设置和保存编排。纯逻辑集中为可测试 ES 模块，File System Access API 与 IndexedDB 分别封装，避免页面代码接触 Vault 句柄。

**Tech Stack:** Chrome Manifest V3、原生 HTML/CSS/JavaScript ES Modules、File System Access API、IndexedDB、`node:test`。

## Global Constraints

- 不调用飞书开放平台 API，不要求企业管理员授权。
- 不引入运行时依赖、远程脚本、构建工具或第三方服务。
- 设置路径只允许 Vault 内相对目录，禁止绝对路径和 `..`。
- 同名 Markdown 必须递增命名，不能覆盖已有文件。
- 图片失败不能阻断正文保存，必须保留远程链接并返回警告。
- 无法访问真实私有飞书页面时，只能说明本地夹具验证结果，不能宣称真实页面已经完全验证。

---

### Task 1: 扩展骨架与路径安全模块

**Files:**
- Create: `manifest.json`
- Create: `package.json`
- Create: `src/path-utils.js`
- Create: `tests/path-utils.test.js`

**Interfaces:**
- Produces: `sanitizeFilename(title, fallback?) -> string`
- Produces: `parseRelativeDirectory(path) -> string[]`
- Produces: `nextAvailableName(baseName, exists, maxAttempts?) -> Promise<string>`
- Produces: `escapeYamlString(value) -> string`

- [ ] **Step 1: 写失败测试**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeFilename, parseRelativeDirectory, nextAvailableName, escapeYamlString } from "../src/path-utils.js";

test("清理非法文件名并提供回退标题", () => {
  assert.equal(sanitizeFilename(' A/B:C*D?"<>|. '), "A B C D");
  assert.equal(sanitizeFilename("   "), "未命名飞书文档");
});

test("拒绝绝对路径和越界路径", () => {
  assert.deepEqual(parseRelativeDirectory("raw/01-articles"), ["raw", "01-articles"]);
  assert.throws(() => parseRelativeDirectory("../secret"), /Vault/);
  assert.throws(() => parseRelativeDirectory("/tmp"), /Vault/);
});

test("同名文件自动递增", async () => {
  const existing = new Set(["标题.md", "标题-2.md"]);
  assert.equal(await nextAvailableName("标题", async name => existing.has(name)), "标题-3.md");
});

test("YAML 双引号字符串安全转义", () => {
  assert.equal(escapeYamlString('a"b\\c\n'), '"a\\"b\\\\c\\n"');
});
```

- [ ] **Step 2: 运行 `npm test`，确认因模块不存在而失败**

Expected: FAIL，错误包含 `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现最小路径模块与 Manifest**

`manifest.json` 使用 MV3，声明 `storage`、`activeTab` 权限，`https://*.feishu.cn/*` host permission，注册 `src/content.js`，并将 `popup.html` 设为 action popup。`package.json` 设置 `"type": "module"` 和 `"test": "node --test"`。实现四个已定义函数：文件名最长 120 字符；根目录空字符串返回空数组；递增最多尝试 999 次。

- [ ] **Step 4: 运行测试和 `git diff --check`**

Expected: 全部 4 个测试 PASS，无空白错误。

- [ ] **Step 5: 提交**

```bash
git add manifest.json package.json src/path-utils.js tests/path-utils.test.js
git commit -m "feat: add extension scaffold and safe path utilities"
```

### Task 2: HTML 到 Markdown 转换器

**Files:**
- Create: `src/markdown.js`
- Create: `tests/markdown.test.js`
- Create: `tests/support/fake-dom.js`

**Interfaces:**
- Consumes: DOM-like nodes exposing `nodeType`, `tagName`, `childNodes`, `textContent`, `getAttribute()`。
- Produces: `convertArticle(root, options) -> { markdown: string, images: Array<{id, src, alt}> }`
- `options`: `{ title, sourceUrl, capturedAt }`

- [ ] **Step 1: 写失败测试**

```js
test("转换常见块级与行内格式", () => {
  const root = element("div", {}, [
    element("h1", {}, [text("章节")]),
    element("p", {}, [text("正文 "), element("strong", {}, [text("重点")]), text(" "), element("a", { href: "https://example.com" }, [text("链接")])]),
    element("ul", {}, [element("li", {}, [text("项目")])]),
    element("pre", {}, [element("code", { class: "language-js" }, [text("const x = 1;")])])
  ]);
  const result = convertArticle(root, { title: "测试", sourceUrl: "https://x.feishu.cn/wiki/a", capturedAt: "2026-07-11T12:00:00+08:00" });
  assert.match(result.markdown, /# 测试/);
  assert.match(result.markdown, /## 章节/);
  assert.match(result.markdown, /正文 \*\*重点\*\* \[链接\]\(https:\/\/example.com\)/);
  assert.match(result.markdown, /- 项目/);
  assert.match(result.markdown, /```js\nconst x = 1;\n```/);
});

test("输出表格、任务列表和图片占位", () => {
  const root = articleFixtureWithTableTaskAndImage();
  const result = convertArticle(root, { title: "测试", sourceUrl: "https://x.feishu.cn/wiki/a", capturedAt: "2026-07-11T12:00:00+08:00" });
  assert.equal(result.images[0].src, "https://x.feishu.cn/image/a");
  assert.match(result.markdown, /\| A \| B \|/);
  assert.match(result.markdown, /- \[x\] 完成/);
  assert.match(result.markdown, /@@FEISHU_IMAGE_1@@/);
});
```

- [ ] **Step 2: 运行 `node --test tests/markdown.test.js`**

Expected: FAIL，错误包含 `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现递归转换**

实现文本转义、段落、标题下移、列表嵌套、任务复选框、引用、粗体、斜体、删除线、行内代码、代码块语言、链接、表格、分隔线、`br` 和 `img`。图片写为唯一占位符并返回清单；YAML 写入 `title`、`source`、`captured_at`、`source_type: feishu`。规范化代码块以外的连续空行。

- [ ] **Step 4: 运行 `npm test`**

Expected: Task 1 和 Task 2 测试全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/markdown.js tests/markdown.test.js tests/support/fake-dom.js
git commit -m "feat: convert Feishu document HTML to Markdown"
```

### Task 3: 飞书正文识别与图片读取

**Files:**
- Create: `src/content-core.js`
- Create: `src/content.js`
- Create: `tests/content-core.test.js`

**Interfaces:**
- Produces: `scoreArticleCandidate(element) -> number`
- Produces: `chooseArticleCandidate(candidates) -> Element|null`
- Content message `EXTRACT_ARTICLE` -> `{ok, article?: {title, html, url}, error?}`
- Content message `FETCH_IMAGE` with `{url}` -> `{ok, dataUrl?, mimeType?, error?}`

- [ ] **Step 1: 写候选评分失败测试**

```js
test("优先选择长正文而非导航", () => {
  const nav = candidate({ text: "首页 文档 设置", blocks: 1, hidden: false });
  const article = candidate({ text: "这是一段足够长的正文".repeat(30), blocks: 12, hidden: false });
  assert.equal(chooseArticleCandidate([nav, article]), article);
});

test("忽略隐藏节点和过短内容", () => {
  assert.equal(chooseArticleCandidate([candidate({ text: "长文本".repeat(100), blocks: 10, hidden: true })]), null);
  assert.equal(chooseArticleCandidate([candidate({ text: "短", blocks: 1, hidden: false })]), null);
});
```

- [ ] **Step 2: 运行 `node --test tests/content-core.test.js`**

Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 实现识别和消息协议**

按编辑器/ProseMirror/文档内容语义选择器收集候选，加入 `main` 和 `[role=main]` 回退；评分考虑可见文本长度和块元素数量，拒绝隐藏与文本少于 80 字的候选。克隆正文后移除工具栏、评论、目录、按钮、脚本、样式和隐藏节点。标题依次取文档标题输入/标题节点/浏览器标题。图片获取限定 `https:` 或 `data:`，使用 `fetch(url, {credentials: "include"})`，转成 data URL 返回。

- [ ] **Step 4: 运行 `npm test`**

Expected: 所有测试 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/content-core.js src/content.js tests/content-core.test.js
git commit -m "feat: extract rendered Feishu article content"
```

### Task 4: Vault 授权与无覆盖写入

**Files:**
- Create: `src/handle-store.js`
- Create: `src/vault.js`
- Create: `tests/vault.test.js`
- Create: `tests/support/fake-filesystem.js`

**Interfaces:**
- Produces: `saveDirectoryHandle(handle)`, `loadDirectoryHandle()`, `clearDirectoryHandle()`。
- Produces: `queryVaultPermission(handle) -> "granted"|"prompt"|"denied"`
- Produces: `requestVaultPermission(handle) -> boolean`
- Produces: `saveArticleToVault({vaultHandle, noteDirectory, attachmentDirectory, article, imageResults}) -> {notePath, savedImages, failedImages, warnings}`

- [ ] **Step 1: 写失败测试**

```js
test("创建子目录、保存图片并且不覆盖同名笔记", async () => {
  const fs = fakeVault({ "notes/标题.md": "旧内容" });
  const result = await saveArticleToVault({
    vaultHandle: fs.root,
    noteDirectory: "notes",
    attachmentDirectory: "assets/feishu",
    article: { title: "标题", markdown: "正文 @@FEISHU_IMAGE_1@@", images: [{ id: 1, src: "https://x/image" }] },
    imageResults: new Map([[1, { ok: true, blob: new Blob(["png"], { type: "image/png" }) }]])
  });
  assert.equal(result.notePath, "notes/标题-2.md");
  assert.equal(fs.read("notes/标题.md"), "旧内容");
  assert.match(fs.read("notes/标题-2.md"), /!\[\[assets\/feishu\/标题-01.png\]\]/);
});

test("图片失败时保留远程链接", async () => {
  const { result, savedMarkdown } = await saveWithFailedImage();
  assert.match(savedMarkdown, /!\[图片\]\(https:\/\/x\/image\)/);
  assert.equal(result.failedImages, 1);
});
```

- [ ] **Step 2: 运行 `node --test tests/vault.test.js`**

Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 实现 IndexedDB 与 Vault 写入器**

IndexedDB 数据库名 `feishu-to-obsidian`、对象仓库 `handles`、键 `vault`。Vault 写入器逐级创建相对目录，按 MIME 映射 `png/jpg/gif/webp/svg`，写入图片后替换对应占位符；失败图片替换为带转义 alt 的标准 Markdown 外链。Markdown 使用 `createWritable()` 完整写入新文件；通过 `getFileHandle(name, {create:false})` 判断存在并只把 `NotFoundError` 当作不存在。

- [ ] **Step 4: 运行 `npm test`**

Expected: 所有测试 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/handle-store.js src/vault.js tests/vault.test.js tests/support/fake-filesystem.js
git commit -m "feat: persist Vault access and save notes safely"
```

### Task 5: 弹窗界面与完整保存流程

**Files:**
- Create: `popup.html`
- Create: `popup.css`
- Create: `src/popup.js`
- Create: `src/popup-core.js`
- Create: `tests/popup-core.test.js`

**Interfaces:**
- Consumes: `convertArticle`、handle-store API、vault API、内容消息协议。
- Produces: `validateFeishuUrl(url) -> boolean`
- Produces: `dataUrlToBlob(dataUrl) -> Blob`
- Produces: 可操作的 Chrome action popup。

- [ ] **Step 1: 写弹窗纯逻辑失败测试**

```js
test("只接受飞书 HTTPS 文档地址", () => {
  assert.equal(validateFeishuUrl("https://a.feishu.cn/wiki/token"), true);
  assert.equal(validateFeishuUrl("https://a.feishu.cn/docx/token"), true);
  assert.equal(validateFeishuUrl("https://evil.example/wiki/token"), false);
  assert.equal(validateFeishuUrl("http://a.feishu.cn/wiki/token"), false);
});

test("把 data URL 恢复为 Blob", async () => {
  const blob = dataUrlToBlob("data:image/png;base64,aGk=");
  assert.equal(blob.type, "image/png");
  assert.equal(await blob.text(), "hi");
});
```

- [ ] **Step 2: 运行 `node --test tests/popup-core.test.js`**

Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 实现弹窗状态机和界面**

页面载入时读取活动标签、设置和目录句柄；设置包含 `noteDirectory`（默认空）与 `attachmentDirectory`（默认 `attachments/feishu`）。未授权显示选择 Vault；已授权且为支持页面显示保存。保存时依次提取、用 `DOMParser` 转换、逐张发送图片请求、写入 Vault。按钮在进行中禁用；成功显示笔记路径及图片计数；部分失败使用警告色；错误按非飞书、无权限、正文未加载、Vault 授权和写入失败分类。

- [ ] **Step 4: 运行 `npm test` 并执行静态语法检查**

Run: `npm test && node --check src/popup.js && node --check src/content.js`

Expected: 全部 PASS，语法检查退出码 0。

- [ ] **Step 5: 提交**

```bash
git add popup.html popup.css src/popup.js src/popup-core.js tests/popup-core.test.js
git commit -m "feat: add popup save workflow"
```

### Task 6: 安装说明与发布前验证

**Files:**
- Create: `README.md`
- Create: `tests/fixtures/feishu-article.html`
- Create: `tests/manual-checklist.md`
- Modify: `manifest.json`

**Interfaces:**
- Produces: 用户可按步骤加载、授权、配置和验证插件。

- [ ] **Step 1: 添加中文安装与使用文档**

README 必须包含：打开 `chrome://extensions`、启用开发者模式、加载本项目目录、打开已登录飞书文档、首次选择 Vault、设置相对路径、保存和排错；注明插件只能读取用户本来有权访问的当前文档。

- [ ] **Step 2: 添加夹具和人工检查清单**

夹具包含标题、段落、嵌套列表、任务列表、引用、代码、表格、链接与两张图片。检查清单逐项记录首次授权、重复保存、图片失败、非飞书页、无权限页和撤销目录权限的期望结果。

- [ ] **Step 3: 执行完整验证**

Run: `npm test && node --check src/*.js && git diff --check`

Expected: 测试全部 PASS；所有脚本语法正确；无空白错误。

- [ ] **Step 4: 检查扩展清单与文件引用**

用脚本读取 `manifest.json`，确认 manifest version 为 3，popup/content script/icon 之外所有被引用文件存在；搜索并确认没有 `http://` 远程脚本、`eval`、绝对本地路径或硬编码飞书 Cookie。

- [ ] **Step 5: 最终提交**

```bash
git add README.md tests/fixtures/feishu-article.html tests/manual-checklist.md manifest.json
git commit -m "docs: add installation and verification guide"
```
