# GitHub Release 自动发布实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Chrome 扩展建立经过测试的 ZIP 打包流程，并在推送版本标签时自动创建 GitHub 正式 Release。

**Architecture:** 将版本解析、发布文件白名单和 ZIP 校验放入可测试的 Node.js 模块，命令行脚本只负责编排文件系统与压缩命令。GitHub Actions 复用 npm 命令完成测试、校验、打包和 Release 上传，避免本地与 CI 规则分叉。

**Tech Stack:** Node.js 20、Node 内置测试框架、系统 `zip`/`unzip`、GitHub Actions、GitHub CLI。

## Global Constraints

- 首个正式版本固定为 `v0.1.0`，`package.json` 与 `manifest.json` 中的版本均为 `0.1.0`。
- ZIP 根目录必须直接包含 `manifest.json`，且只包含 `manifest.json`、`popup.html`、`popup.css`、`src/` 下的 JavaScript 文件和 `assets/` 下的 PNG/SVG 品牌资源。
- 发布前必须通过 `npm test` 与 `node --check src/*.js scripts/*.mjs`。
- GitHub Actions 仅授予 `contents: write`，不依赖付费服务。
- `dist/` 不提交到 Git。

---

### Task 1: 可测试的发布规则

**Files:**
- Create: `tests/release-package.test.js`
- Create: `scripts/release-package-core.mjs`

**Interfaces:**
- Produces: `normalizeTag(tag: string): string`，返回不含 `v` 的版本。
- Produces: `validateVersions({ tag, packageVersion, manifestVersion }): string`，成功返回规范版本，失败抛出错误。
- Produces: `RELEASE_PATHS: readonly string[]`，定义顶层发布白名单。
- Produces: `validateArchiveEntries(entries: string[]): void`，拒绝目录嵌套、缺失必需文件和白名单外文件。

- [ ] **Step 1: 编写失败测试**

测试覆盖 `v0.1.0` 解析、三方版本一致、版本不一致、合法 ZIP 清单、嵌套目录、缺失文件和白名单外文件。

- [ ] **Step 2: 运行测试并确认因模块不存在而失败**

Run: `node --test tests/release-package.test.js`
Expected: FAIL，错误包含 `ERR_MODULE_NOT_FOUND`。

- [ ] **Step 3: 实现最小发布规则模块**

使用严格的 `v?数字.数字.数字` 格式；白名单为三个顶层文件及 `src/*.js`；必需文件为 `manifest.json`、`popup.html`、`popup.css`，并要求至少一个 `src/*.js`。

- [ ] **Step 4: 运行测试并确认通过**

Run: `node --test tests/release-package.test.js`
Expected: 所有新增测试 PASS。

- [ ] **Step 5: 提交**

```bash
git add tests/release-package.test.js scripts/release-package-core.mjs
git commit -m "test: define release package rules"
```

### Task 2: 本地 ZIP 打包命令

**Files:**
- Create: `scripts/package-release.mjs`
- Modify: `package.json`
- Create: `.gitignore`

**Interfaces:**
- Consumes: Task 1 的 `validateVersions`、`RELEASE_PATHS` 和 `validateArchiveEntries`。
- Produces: `npm run package`，生成 `dist/feishu-ob-clipper-v<version>.zip`。
- Produces: `npm run check`，运行所有 JavaScript 语法检查。

- [ ] **Step 1: 为命令行打包行为增加失败测试**

在临时目录复制最小扩展文件，执行脚本并断言产物命名、ZIP 根目录、文件清单与版本；此时因脚本不存在而失败。

- [ ] **Step 2: 运行测试并确认失败原因正确**

Run: `node --test tests/release-package.test.js`
Expected: FAIL，指出 `package-release.mjs` 不存在或命令退出非零。

- [ ] **Step 3: 实现打包脚本与 npm 命令**

脚本读取项目根目录的两个版本文件，可选读取 `RELEASE_TAG`；清理并重建 `dist/staging`，按白名单复制文件，调用 `zip -r` 生成产物，再用 `unzip -Z1` 取得条目并调用 `validateArchiveEntries`。成功后删除 staging，仅保留 ZIP。

`package.json` 新增：

```json
"check": "node --check src/*.js scripts/*.mjs",
"package": "node scripts/package-release.mjs"
```

`.gitignore` 增加 `dist/`。

- [ ] **Step 4: 运行新增测试与真实打包**

Run: `npm test && npm run check && npm run package && unzip -Z1 dist/feishu-ob-clipper-v0.1.0.zip`
Expected: 命令退出码为 0；ZIP 清单只有允许文件，且 `manifest.json` 位于根目录。

- [ ] **Step 5: 提交**

```bash
git add tests/release-package.test.js scripts/package-release.mjs package.json .gitignore
git commit -m "feat: add reproducible extension package"
```

### Task 3: GitHub Actions 与用户文档

**Files:**
- Create: `.github/workflows/release.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: `npm test`、`npm run check`、`RELEASE_TAG=<tag> npm run package`。
- Produces: 推送 `v*` 标签后创建非草稿、非预发布 Release，并上传 `dist/*.zip`。

- [ ] **Step 1: 编写工作流静态验证测试**

在 `tests/release-package.test.js` 中读取工作流，断言触发器为 `v*`、权限为 `contents: write`、依次执行测试/检查/打包，并使用 GitHub 官方 `gh release create` 命令上传 ZIP；此时因工作流不存在而失败。

- [ ] **Step 2: 运行测试并确认失败原因正确**

Run: `node --test tests/release-package.test.js`
Expected: FAIL，指出 `.github/workflows/release.yml` 不存在。

- [ ] **Step 3: 新增工作流并更新 README**

工作流使用 `actions/checkout@v4`、`actions/setup-node@v4` 和 Node.js 20，设置 `RELEASE_TAG: ${{ github.ref_name }}`，执行完整验证后运行 `gh release create "$RELEASE_TAG" dist/*.zip --title "$RELEASE_TAG" --generate-notes --verify-tag`。

README 增加 Release 下载、开发者模式安装、升级替换目录，以及维护者修改版本、提交、打标签和推送标签的步骤。

- [ ] **Step 4: 运行完整本地验证**

Run: `npm test && npm run check && RELEASE_TAG=v0.1.0 npm run package && unzip -t dist/feishu-ob-clipper-v0.1.0.zip && git diff --check`
Expected: 所有测试 PASS，语法检查与 ZIP 完整性检查退出码为 0，Git diff 无空白错误。

- [ ] **Step 5: 提交**

```bash
git add .github/workflows/release.yml README.md tests/release-package.test.js
git commit -m "ci: publish tagged GitHub releases"
```

### Task 4: 远程仓库与 v0.1.0 正式发布

**Files:**
- No file changes.

**Interfaces:**
- Consumes: 本地 `main` 分支、GitHub 仓库 `ushowjack/feishu-ob-clipper`、有效的 GitHub CLI 登录。
- Produces: 远程 `main`、标签 `v0.1.0`、正式 Release 和 ZIP 附件。

- [ ] **Step 1: 验证本地发布状态**

Run: `git status -sb && git log -5 --oneline && gh auth status`
Expected: 除已知无关文件外无发布相关未提交改动，GitHub 登录有效。

- [ ] **Step 2: 配置并验证远程**

若 `origin` 不存在，运行 `git remote add origin https://github.com/ushowjack/feishu-ob-clipper.git`；随后运行 `git remote -v` 与 `gh repo view ushowjack/feishu-ob-clipper`。

- [ ] **Step 3: 推送 main 并创建标签**

Run: `git push -u origin main`，成功后运行 `git tag -a v0.1.0 -m "Release v0.1.0"` 与 `git push origin v0.1.0`。
Expected: 分支与标签均推送成功；如果远程历史冲突或标签已存在，停止并检查，不强推、不覆盖。

- [ ] **Step 4: 验证 Actions 与 Release**

Run: `gh run watch --exit-status`，然后 `gh release view v0.1.0 --json isDraft,isPrerelease,url,assets`。
Expected: 工作流成功；`isDraft=false`、`isPrerelease=false`，附件名为 `feishu-ob-clipper-v0.1.0.zip`。

- [ ] **Step 5: 下载远程附件并独立检查**

下载到临时目录，运行 `unzip -t`、`unzip -Z1`，并解析其中的 `manifest.json`。
Expected: ZIP 完整、清单符合白名单、Manifest 版本为 `0.1.0`。
