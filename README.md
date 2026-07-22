<p align="center">
  <img src="assets/logo.svg" width="88" alt="财摘 Logo">
</p>

<h1 align="center">财摘</h1>

<p align="center"><strong>把飞书文档和生财文章一键摘进 Obsidian</strong></p>

<p align="center">
  使用当前登录状态 · 正文与图片一起保存 · 数据不经过第三方服务器
</p>

<p align="center">
  <a href="https://github.com/ushowjack/feishu-ob-clipper/releases/latest"><strong>下载最新版</strong></a>
  ·
  <a href="#四步开始使用">安装教程</a>
  ·
  <a href="#常见问题">常见问题</a>
</p>

## 财摘能做什么

财摘是一款 Chrome 插件。打开你有权限访问的飞书文档或生财文章，点击插件，它会根据当前网址选择对应的正文抓取规则，转换成 Markdown，并把文中的图片一起保存到你选择的 Obsidian Vault。

- 保存标题、段落、列表、引用、代码块、表格、链接和图片。
- 保存前可以修改标题、标签、日期等 Obsidian 属性。
- 图片写入指定附件目录，正文自动使用 Obsidian `![[...]]` 链接。
- 遇到同名笔记或图片会自动改名，不覆盖已有文件。
- 飞书网址沿用原项目的文档与长文采集；生财网址读取当前文章的完整正文容器。
- 自动排除页面导航、操作控件、评论区和其他文章内容流。
- 所有内容只在当前浏览器与本地 Vault 之间处理。

## v0.3.0 更新

- 在原有飞书 Wiki、`docx` 和 `docs` 剪藏能力上，新增生财文章详情页剪藏。
- 生财文章会保留完整标题、发布日期、标题层级、列表、表格、链接和正文图片。
- 飞书与生财使用各自独立的正文抓取模块，避免不同网站的页面规则互相影响。
- 插件升级为“财摘”，安装包名称同步调整为 `caizhai-ob-clipper-v*.zip`。

## 四步开始使用

### 1. 下载并解压

前往 [Releases 页面](https://github.com/ushowjack/feishu-ob-clipper/releases/latest)，下载 `caizhai-ob-clipper-v*.zip`，然后解压到一个固定目录。

> Chrome 会一直从该目录读取插件，安装后不要删除或随意移动它。

### 2. 加载到 Chrome

1. 在 Chrome 地址栏输入 `chrome://extensions`。
2. 打开右上角的“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择刚才解压的目录；正确目录里可以直接看到 `manifest.json`。
5. 建议通过工具栏的拼图图标，把“财摘”固定到工具栏。

### 3. 首次选择 Obsidian Vault

1. 打开已登录且有权限访问的飞书文档或生财文章详情页。
2. 等正文显示完成后，点击工具栏中的“财摘”。
3. 点击“选择 Obsidian Vault”。
4. 在系统目录选择器里选中 Vault 根目录，并允许写入。

这是 Chrome 的本地目录授权。财摘不会得到其他文件夹的权限，也不会上传目录信息。

### 4. 保存当前文章

1. 检查文章标题和属性，需要时直接修改。
2. 确认底部的笔记目录；留空会保存到 Vault 根目录，也可以填写 `raw/01-articles` 这样的相对路径。
3. 点击“添加到 Obsidian”。
4. 看到成功提示后，回到 Obsidian 查看笔记。

默认附件目录是 `attachments/caizhai`，不存在时会自动创建。

## 保存后的效果

保存结果是普通 Markdown 文件，属性和图片都能被 Obsidian 直接识别：

```markdown
---
title: "示例生财文章"
source: "https://scys.com/articleDetail/xq_topic/45544285884128158"
created: "2026-07-15"
tags:
  - "clippings"
---

# 示例生财文章

这里是文章正文……

![[attachments/caizhai/示例生财文章-01.png]]
```

## 使用范围

当前支持：

- 飞书：`https://*.feishu.cn/wiki/*`、`docx/*` 和 `docs/*`。
- 生财：`https://scys.com/articleDetail/*`。

飞书网址只使用飞书正文抓取逻辑，生财网址只使用生财正文抓取逻辑，其他网址不会尝试猜测正文。

评论、推荐内容流、页面操作控件和视频不会写入正文。遇到暂时无法下载的图片时，财摘仍会保存正文并保留远程图片链接，同时提示失败数量。

## 常见问题

### 提示“插件尚未注入当前页面”

刚安装或更新插件后，请刷新已经打开的飞书文档或生财文章页面。Chrome 不会自动把新内容脚本注入旧标签页。

### 提示“没有识别到已加载的正文”

确认当前账号有访问权限，并等待正文显示完成。飞书首页、生财活动页、搜索页等非正文页面不受支持。

### 再次打开 Chrome 后提示恢复 Vault 授权

这是浏览器对本地目录的安全保护。点击“恢复 Vault 授权”；如果仍然失败，进入设置并重新选择 Vault。

### 部分图片没有保存

文章图片可能使用临时地址或已过期的签名。财摘会尽量保存可读取的图片；失败时仍会保留正文和远程图片链接。

### 路径填写后无法保存

这里只能填写 Vault 内的相对路径。`/绝对路径`、`C:\路径` 或包含 `..` 的越界路径会被拒绝。

## 隐私与权限

- `activeTab`：读取当前标签页并向页面内的内容脚本发送提取请求。
- `storage`：在浏览器本地保存笔记目录、附件目录和属性模板。
- `https://*.feishu.cn/*`：读取当前账号已经能够查看的飞书文档与图片。
- `https://scys.com/*`：读取当前账号已经能够查看的生财文章与图片。
- Vault 权限：由 Chrome 的系统目录选择器单独授权，只能访问用户选择的目录。

财摘不接入统计服务，也不会把文章、图片或 Vault 信息发送到第三方服务器。

## 更新插件

从 [Releases 页面](https://github.com/ushowjack/feishu-ob-clipper/releases/latest) 下载并解压新版本，用新目录替换旧目录，然后到 `chrome://extensions` 点击“财摘”卡片上的“重新加载”，最后刷新已经打开的飞书文档或生财文章。

## 开发与打包

项目没有运行时依赖或前端构建步骤。使用 Node.js 20 或更高版本执行：

```bash
npm test
npm run check
npm run package
```

`npm run package` 会在 `dist/` 中生成带版本号的财摘安装包。浏览器人工验收步骤见 [`tests/manual-checklist.md`](tests/manual-checklist.md)。

发布正式版本时，需要同步修改 `package.json` 与 `manifest.json` 的版本，完成验证并提交，然后创建同版本 Git 标签。标签推送后，GitHub Actions 会再次运行测试和语法检查，并创建 Release、上传 ZIP。

### 爬虫模块开发约束

项目采用“一类网站，一个独立爬虫模块”：飞书抓取位于 `src/feishu-site.js`，生财抓取位于 `src/scys-site.js`。新增网站时必须新建对应的 `src/<site>-site.js`，公共文件只负责网站识别、路由和真正复用的能力，不能继续堆放网站专属选择器和抓取逻辑。

完整的新增网站清单和强制边界见 [`AGENTS.md`](AGENTS.md)。

## 反馈问题

反馈时建议提供：

- 当前页面是飞书文档还是生财文章，以及对应网址类型。
- 弹窗中出现的完整错误提示。
- 是否已经重新加载插件并刷新文章页面。

请不要上传包含隐私内容的文章正文、截图或 Vault 文件。
