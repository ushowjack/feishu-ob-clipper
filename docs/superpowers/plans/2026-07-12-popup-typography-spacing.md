# 弹窗文字与间距优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变弹窗结构和业务行为的前提下，统一文字层级、间距节奏与行内对齐。

**Architecture:** 保持现有 HTML 与 JavaScript 不变，只调整 `popup.css` 中的排版标尺。使用文本级 CSS 约束测试固定关键视觉参数，降低后续样式回退风险。

**Tech Stack:** Chrome Extension Manifest V3、原生 HTML/CSS、Node.js 原生测试运行器。

## Global Constraints

- 项目文档和用户可见文案使用中文。
- 不新增运行时依赖或构建步骤。
- 保留现有品牌、功能、DOM 结构和 JavaScript 行为。
- 弹窗宽度保持 420px，不允许横向溢出。
- 现有测试必须全部通过。

---

### Task 1: 固定排版标尺并调整样式

**Files:**
- Modify: `tests/popup-ui.test.js`
- Modify: `popup.css`

**Interfaces:**
- Consumes: 现有 `.title-input`、`.section-title`、`.property-row`、`.action-dock` 等选择器。
- Produces: 统一的字号、行高、间距、最小高度和溢出规则。

- [x] **Step 1: 编写失败的样式约束测试**

在 `tests/popup-ui.test.js` 中读取 CSS 规则并断言：标题为 20px；属性行最小高度为 42px；属性输入为 14px；编辑区水平留白为 18px；底部按钮最小高度为 48px。

- [x] **Step 2: 运行测试并确认测试因旧标尺失败**

Run: `node --test tests/popup-ui.test.js`

Expected: FAIL，断言显示旧值仍为标题 21px、属性行 38px 或编辑区 20px。

- [x] **Step 3: 实现最小 CSS 调整**

修改 `popup.css`：统一基础字号和行高；调整工具栏、编辑区、标题、区块、属性行、预览区与底部操作区的字号和 4/8px 间距节奏；为输入内容设置安全的截断与溢出行为。

- [x] **Step 4: 运行 UI 样式测试确认通过**

Run: `node --test tests/popup-ui.test.js`

Expected: 全部 PASS。

- [x] **Step 5: 运行完整测试集**

Run: `npm test`

Expected: 全部 PASS，无错误与警告。

- [x] **Step 6: 自检范围和溢出风险**

Run: `git diff --check && git diff -- popup.css tests/popup-ui.test.js`

Expected: 无空白错误，差异只包含排版样式与对应测试。
