# 飞摘公开 README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 制作一份面向普通用户、图文并茂且可独立完成安装与首次保存的中文 README，并将当前插件版本通过 SSH 发布到公开 GitHub 仓库。

**Architecture:** README 以“理解产品—下载安装—首次授权—保存文档—排查问题”为主线，真实插件界面与步骤图统一保存在 `docs/images/`。发布前用项目现有测试、语法检查、打包脚本和 Git/GitHub 状态完成闭环验证。

**Tech Stack:** Markdown、HTML/CSS、Chrome Extension Manifest V3、Node.js 20+、Playwright/Chromium 截图、Git、GitHub CLI。

## Global Constraints

- 项目文档及汇报使用中文。
- 配图不包含真实账号、Vault 路径、飞书文档内容或敏感信息。
- 不新增插件功能，不调整既定产品交互，不使用外部图床或付费服务。
- 目标仓库为 `ushowjack/feishu-ob-clipper`，Git 远程必须使用 SSH。
- 当前工作区现有插件改动已获用户授权一起公开，但不得包含缓存、临时文件和打包产物。

---

### Task 1: 生成真实产品配图

**Files:**
- Create: `docs/images/feizhai-popup.png`
- Create: `docs/images/feizhai-quick-start.png`
- Inspect: `popup.html`
- Inspect: `popup.css`
- Inspect: `src/popup.js`

**Interfaces:**
- Consumes: 当前 `popup.html` 与 `popup.css` 的真实界面。
- Produces: README 可使用相对路径引用的 PNG 图片。

- [ ] **Step 1: 启动本地静态服务器并用 Chromium 打开 `popup.html`**

Run: `python3 -m http.server 4173`

Expected: `http://127.0.0.1:4173/popup.html` 返回 200，页面尺寸与扩展弹窗一致。

- [ ] **Step 2: 截取真实弹窗并检查图片尺寸**

Run: `node <screenshot-script> http://127.0.0.1:4173/popup.html docs/images/feizhai-popup.png`

Expected: `docs/images/feizhai-popup.png` 为清晰 PNG，无账号、绝对路径或真实文档内容。

- [ ] **Step 3: 制作四步上手说明图**

使用真实弹窗截图、项目 Logo 与中文短句组合为 `docs/images/feizhai-quick-start.png`，四步固定为“下载并解压、加载已解压扩展、选择 Obsidian Vault、打开飞书并保存”。

Expected: 图片在窄屏下仍可辨认，说明与 README 文本一致。

- [ ] **Step 4: 视觉检查两张图片**

Run: `file docs/images/*.png`

Expected: 两张图片均为有效 PNG，宽高非零，文字无裁切。

### Task 2: 重写面向普通用户的 README

**Files:**
- Modify: `README.md`
- Reference: `manifest.json`
- Reference: `package.json`
- Reference: `tests/manual-checklist.md`

**Interfaces:**
- Consumes: Task 1 的 `docs/images/feizhai-popup.png` 与 `docs/images/feizhai-quick-start.png`。
- Produces: GitHub 仓库首页 README。

- [ ] **Step 1: 改写产品首屏和效果预览**

首屏包含 Logo、“飞摘”名称、“把飞书文档一键摘进 Obsidian”的一句话、Release 下载入口、Chrome/Obsidian/本地处理三项说明，并引用真实弹窗图。

- [ ] **Step 2: 写成四步快速上手路径**

固定顺序为下载 Release ZIP、在 `chrome://extensions` 加载解压目录、首次选择 Vault、打开飞书文档并保存；同时引用四步说明图。

- [ ] **Step 3: 收敛功能、支持范围、常见问题和隐私说明**

保留格式与图片支持、防覆盖、长文采集、Vault 恢复授权、图片失败等实际能力；明确不支持评论、画板、电子表格和复杂嵌入。

- [ ] **Step 4: 折叠维护者说明**

使用 `<details>` 包含源码安装、`npm test`、`npm run check`、`npm run package` 与 Release 标签发布方式，避免打断普通用户阅读。

- [ ] **Step 5: 检查 README 链接与占位符**

Run: `rg -n "TBD|TODO|待定|example.com|docs/images" README.md`

Expected: 无占位内容；所有 `docs/images` 引用均对应现有文件。

### Task 3: 验证当前公开版本

**Files:**
- Verify: `manifest.json`
- Verify: `package.json`
- Verify: `src/`
- Verify: `tests/`
- Verify: `README.md`

**Interfaces:**
- Consumes: 完整工作区和 README 产物。
- Produces: 可公开发布的验证证据与 Release ZIP。

- [ ] **Step 1: 运行自动测试**

Run: `npm test`

Expected: 所有 Node 测试通过，退出码为 0。

- [ ] **Step 2: 运行语法与版本检查**

Run: `npm run check`

Expected: JavaScript 语法、Manifest 与包版本检查通过，退出码为 0。

- [ ] **Step 3: 生成 Release 包**

Run: `npm run package`

Expected: `dist/feishu-ob-clipper-v0.1.0.zip` 生成，包内含 README、Manifest、弹窗、源码和图标，不含开发测试文件。

- [ ] **Step 4: 做发布前静态审计**

Run: `git diff --check`

Run: `git status --short`

Run: `rg -n "(ghp_|github_pat_|AIza|BEGIN (RSA|OPENSSH) PRIVATE KEY|/Users/ushow)" --glob '!docs/superpowers/**' --glob '!dist/**' .`

Expected: 无空白错误、无密钥或本机绝对路径；改动只包含已批准插件版本、README、配图、设计和实施文档。

### Task 4: 提交并通过 SSH 发布 GitHub

**Files:**
- Commit: 当前已批准的源码、测试、资源、README 和文档改动。
- Exclude: `dist/` 与任何临时截图脚本、缓存或日志。

**Interfaces:**
- Consumes: Task 3 的全部通过证据。
- Produces: GitHub `main` 默认分支与在线 README。

- [ ] **Step 1: 配置并核验 SSH 远程**

Run: `git remote add origin git@github.com:ushowjack/feishu-ob-clipper.git`

Run: `git remote -v`

Expected: fetch/push 地址均为 `git@github.com:ushowjack/feishu-ob-clipper.git`。

- [ ] **Step 2: 审查并提交所有已批准改动**

Run: `git add README.md manifest.json package.json popup.css popup.html src tests assets scripts docs`

Run: `git diff --cached --stat`

Run: `git commit -m "feat: prepare Feizhai for public release"`

Expected: 提交成功，暂存内容不含 `dist/` 或敏感信息。

- [ ] **Step 3: 推送默认分支**

Run: `git push -u origin main`

Expected: SSH 推送成功，远程 `main` 指向本地 HEAD。

- [ ] **Step 4: 在线核验 GitHub**

Run: `gh repo view ushowjack/feishu-ob-clipper --json url,defaultBranchRef`

Run: `gh api repos/ushowjack/feishu-ob-clipper/contents/README.md --jq '.sha'`

Run: `gh api repos/ushowjack/feishu-ob-clipper/contents/docs/images --jq '.[].name'`

Expected: 默认分支为 `main`；README 与两张 PNG 均存在；远程提交 SHA 与本地 HEAD 一致。
