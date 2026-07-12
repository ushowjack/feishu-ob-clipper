# GitHub Release 自动发布设计

## 目标

为 Chrome 扩展建立可复现的正式版发布流程。首个版本为 `v0.1.0`，普通用户可以从 GitHub Releases 下载 ZIP，解压后直接通过 Chrome 的“加载已解压的扩展程序”安装。

## 完成标准

- `npm test` 与 JavaScript 语法检查通过后才能打包。
- ZIP 根目录直接包含 `manifest.json`，不能额外嵌套项目目录。
- ZIP 只包含扩展运行需要的 `manifest.json`、`popup.html`、`popup.css`、`src/` 和界面引用的 PNG/SVG 品牌资源，不包含测试、Git 历史和开发文档。
- 推送格式为 `v*` 的 Git 标签时，GitHub Actions 自动校验版本、生成 ZIP、创建正式 Release 并上传附件。
- 标签版本、`package.json` 版本和 `manifest.json` 版本必须一致；不一致时发布失败。
- README 明确说明 Release 下载、解压、安装和升级步骤。
- `v0.1.0` Release 页面可访问，附件能够下载并解压，解压后的清单符合以上要求。

## 发布架构

项目继续保持“无需构建”的特性。新增一个本地打包入口和一个 GitHub Actions 工作流：

1. 本地打包脚本读取版本并校验两个版本文件。
2. 脚本将运行文件复制到临时目录，再生成带版本号的 ZIP。
3. GitHub Actions 在标签触发后安装 Node.js、运行测试和语法检查。
4. Actions 调用同一打包脚本，避免本地与 CI 使用两套规则。
5. Actions 使用 GitHub 自带令牌创建正式 Release，并上传 ZIP。

## 文件变更

- 新增 `scripts/package-release.mjs`：版本一致性检查、发布文件白名单（含运行必需品牌资源）、ZIP 生成和产物检查。
- 新增 `.github/workflows/release.yml`：标签触发、测试、打包和 Release 上传。
- 更新 `package.json`：增加 `check` 和 `package` 命令。
- 更新 `README.md`：增加面向普通用户的 Release 安装与升级说明，以及维护者发布步骤。

打包脚本输出到 `dist/`。该目录加入 `.gitignore`，产物不提交进 Git，只作为本地验证结果和 Release 附件。

## 版本与触发规则

- 正式版本采用语义化版本，例如 `0.1.0`。
- Git 标签在版本前增加 `v`，例如 `v0.1.0`。
- 工作流从 `GITHUB_REF_NAME` 取得标签并去掉 `v`，与两个版本文件比较。
- Release 标题使用标签名，首版标题为 `v0.1.0`。
- Release 为正式发布，不设置 prerelease 或 draft。

## 安全与权限

- 工作流只申请创建 Release 所需的 `contents: write` 权限。
- 打包使用明确白名单，避免意外把本地配置、测试数据或其他文件放入安装包。
- 不引入付费服务；发布只依赖 GitHub Actions 与 GitHub Releases 的仓库能力。

## 错误处理

以下情况必须中止发布且不创建 Release：

- 测试或语法检查失败。
- 标签、Manifest 和 package 版本不一致。
- 必需文件缺失。
- ZIP 生成失败，或 ZIP 中出现白名单外文件。
- 同名 Release 或标签已经存在。

如果工作流在 Release 创建前失败，修复后可重新运行；如果已经创建了不完整 Release，应先人工确认并清理错误 Release，再重新发布，避免自动覆盖正式产物。

## 验证方案

本地验证：

1. 运行测试与语法检查。
2. 执行打包命令。
3. 列出 ZIP 内容，确认根目录与白名单。
4. 解压到临时目录，解析 `manifest.json` 并确认版本为 `0.1.0`。

远程验证：

1. 配置并确认远程仓库为 `ushowjack/feishu-ob-clipper`。
2. 推送实现提交与 `v0.1.0` 标签。
3. 等待 GitHub Actions 成功。
4. 检查 Release 为正式版且包含唯一 ZIP 附件。
5. 下载附件，重新核对文件列表、ZIP 完整性与 Manifest 版本。

Chrome 中对真实飞书页面的完整人工验收仍遵循 `tests/manual-checklist.md`。如果当前环境无法完成真实浏览器授权与保存验证，发布说明必须明确标注该风险，不能用自动测试替代宣称完整通过。

## 首次发布边界

本次只发布可供开发者模式加载的 ZIP，不制作 Chrome Web Store 包、不申请商店账号，也不增加自动更新服务。后续版本继续通过修改两个版本文件、提交代码并推送对应标签完成发布。
