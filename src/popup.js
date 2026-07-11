import { loadDirectoryHandle, saveDirectoryHandle } from "./handle-store.js";
import { convertArticle } from "./markdown.js";
import {
  cloneProperties,
  coercePropertyValue,
  createDefaultTemplate,
  emptyValueForType,
  instantiateProperties,
  migratePropertyTemplate,
  PROPERTY_SOURCES,
  PROPERTY_TEMPLATE_VERSION,
  PROPERTY_TYPES,
  serializeFrontmatter,
  validateProperties,
} from "./properties.js";
import {
  dataUrlToBlob,
  localDate,
  nextPropertyKey,
  validateFeishuUrl,
} from "./popup-core.js";
import { parseRelativeDirectory } from "./path-utils.js";
import {
  queryVaultPermission,
  requestVaultPermission,
  saveArticleToVault,
} from "./vault.js";

const TYPE_LABELS = {
  text: "文本",
  list: "多值列表",
  date: "日期",
  boolean: "布尔值",
  number: "数字",
};

const TYPE_ICONS = {
  text: "≡",
  list: "☷",
  date: "▣",
  boolean: "◉",
  number: "#",
};

const SOURCE_LABELS = {
  none: "使用默认值",
  title: "当前文章标题",
  url: "当前页面网址",
  publishedDate: "页面日期",
  createdDate: "当天日期",
};

const elements = {
  editorView: document.querySelector("#editor-view"),
  settingsView: document.querySelector("#settings-view"),
  actionDock: document.querySelector("#action-dock"),
  title: document.querySelector("#document-title"),
  preview: document.querySelector("#article-preview"),
  propertiesList: document.querySelector("#properties-list"),
  templatePropertiesList: document.querySelector("#template-properties-list"),
  openSettings: document.querySelector("#open-settings"),
  cancelSettings: document.querySelector("#cancel-settings"),
  saveSettings: document.querySelector("#save-settings"),
  addProperty: document.querySelector("#add-property"),
  addTemplateProperty: document.querySelector("#add-template-property"),
  vaultName: document.querySelector("#vault-name"),
  noteDirectory: document.querySelector("#note-directory"),
  quickNoteDirectory: document.querySelector("#quick-note-directory"),
  attachmentDirectory: document.querySelector("#attachment-directory"),
  settingsStatus: document.querySelector("#settings-status"),
  status: document.querySelector("#status"),
  primary: document.querySelector("#primary-button"),
  changeVault: document.querySelector("#change-vault"),
};

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
  openMenuId: null,
};

elements.primary.addEventListener("click", handlePrimaryAction);
elements.changeVault.addEventListener("click", chooseVault);
elements.openSettings.addEventListener("click", openSettings);
elements.cancelSettings.addEventListener("click", cancelSettings);
elements.saveSettings.addEventListener("click", saveTemplateSettings);
elements.addProperty.addEventListener("click", addCurrentProperty);
elements.addTemplateProperty.addEventListener("click", addTemplateProperty);
elements.title.addEventListener("input", handleTitleInput);
elements.quickNoteDirectory.addEventListener("input", () => {
  elements.noteDirectory.value = elements.quickNoteDirectory.value;
});
elements.noteDirectory.addEventListener("input", () => {
  elements.quickNoteDirectory.value = elements.noteDirectory.value;
});
document.addEventListener("click", (event) => {
  if (state.openMenuId && !event.target.closest(".property-row")) {
    state.openMenuId = null;
    renderProperties();
  }
});

initialize().catch((error) => showStatus(errorMessage(error), "error"));

async function initialize() {
  const [[tab], settings, handle] = await Promise.all([
    chrome.tabs.query({ active: true, currentWindow: true }),
    chrome.storage.local.get({
      noteDirectory: "raw/01-articles",
      attachmentDirectory: "attachments/feishu",
      propertyTemplate: createDefaultTemplate(),
      propertyTemplateVersion: 0,
    }),
    loadDirectoryHandle().catch(() => null),
  ]);

  state.tab = tab ?? null;
  state.vaultHandle = handle;
  state.template = normalizeTemplate(migratePropertyTemplate(
    settings.propertyTemplate,
    settings.propertyTemplateVersion,
  ));
  state.properties = instantiateProperties(state.template, {
    title: tab?.title || "",
    url: tab?.url || "",
    createdDate: localDate(),
    publishedDate: "",
  });
  state.permission = handle ? await queryVaultPermission(handle) : "denied";

  elements.title.value = tab?.title || "";
  elements.noteDirectory.value = settings.noteDirectory;
  elements.quickNoteDirectory.value = settings.noteDirectory;
  elements.attachmentDirectory.value = settings.attachmentDirectory;
  if (settings.propertyTemplateVersion < PROPERTY_TEMPLATE_VERSION) {
    await chrome.storage.local.set({
      propertyTemplate: state.template,
      propertyTemplateVersion: PROPERTY_TEMPLATE_VERSION,
    });
  }
  renderProperties();
  updateUi();

  if (validateFeishuUrl(tab?.url)) {
    await loadArticlePreview();
  } else {
    elements.preview.textContent = "当前页面不是受支持的飞书 Wiki 或文档。";
    showStatus("请打开一个飞书 Wiki 或文档页面。", "error");
  }
}

async function loadArticlePreview() {
  try {
    elements.preview.textContent = "正在读取当前页面…";
    const extracted = await sendToCurrentTab({ type: "EXTRACT_ARTICLE" });
    if (!extracted?.ok) throw new Error(extracted?.error || "读取飞书正文失败");
    state.article = extracted.article;
    applyExtractedPublishedDate(extracted.article.publishedDate);

    const initialTabTitle = state.tab?.title || "";
    const titleField = state.properties.find((field) => field.key === "title");
    if (titleField && titleField.value === initialTabTitle) titleField.value = extracted.article.title;
    if (!elements.title.value || elements.title.value === initialTabTitle) {
      elements.title.value = extracted.article.title || initialTabTitle;
    }
    elements.preview.textContent = htmlToPreviewText(extracted.article.html);
    renderProperties();
    if (state.vaultHandle && state.permission === "granted") showStatus("准备就绪，可编辑属性后保存。", "");
  } catch (error) {
    elements.preview.textContent = "暂时无法读取正文预览。";
    const message = errorMessage(error);
    showStatus(connectionErrorMessage(message), "error");
  }
}

async function handlePrimaryAction() {
  if (state.busy) return;
  if (!state.vaultHandle) {
    await chooseVault();
    return;
  }
  if (state.permission !== "granted") {
    const granted = await requestVaultPermission(state.vaultHandle);
    state.permission = granted ? "granted" : "denied";
    updateUi();
    showStatus(granted ? "Vault 授权已恢复。" : "Vault 写入授权未恢复，请重新选择目录。", granted ? "success" : "error");
    return;
  }
  await saveCurrentArticle();
}

async function chooseVault() {
  if (state.busy) return;
  if (typeof window.showDirectoryPicker !== "function") {
    showStatus("当前 Chrome 不支持目录写入，请升级到最新版桌面版 Chrome。", "error");
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite", id: "feishu-to-obsidian-vault" });
    await saveDirectoryHandle(handle);
    state.vaultHandle = handle;
    state.permission = await queryVaultPermission(handle);
    updateUi();
    showStatus("Vault 已选择，现在可以保存当前文档。", "success");
  } catch (error) {
    if (error?.name !== "AbortError") showStatus(`选择 Vault 失败：${errorMessage(error)}`, "error");
  }
}

async function saveCurrentArticle() {
  if (!validateFeishuUrl(state.tab?.url)) {
    showStatus("请先打开一个飞书 Wiki 或文档页面。", "error");
    return;
  }

  let startedArticleSave = false;
  try {
    const propertyErrors = validateProperties(state.properties);
    renderPropertyErrors(propertyErrors);
    if (propertyErrors.length) {
      focusPropertyField(propertyErrors[0].id);
      throw new Error(propertyErrors[0].message);
    }

    parseRelativeDirectory(elements.noteDirectory.value);
    parseRelativeDirectory(elements.attachmentDirectory.value);
    const title = elements.title.value.replace(/\p{Cf}/gu, "").trim() || "未命名笔记";
    const frontmatter = serializeFrontmatter(state.properties);

    setBusy(true, "正在读取飞书正文…");
    startedArticleSave = true;
    await persistDirectories();
    const extracted = state.article
      ? { ok: true, article: state.article }
      : await sendToCurrentTab({ type: "EXTRACT_ARTICLE" });
    if (!extracted?.ok) throw new Error(extracted?.error || "读取飞书正文失败");

    const parsed = new DOMParser().parseFromString(`<div>${extracted.article.html}</div>`, "text/html");
    const root = parsed.body.firstElementChild;
    if (!root) throw new Error("飞书正文结构为空");
    const converted = convertArticle(root, { title, frontmatter });

    showStatus(`正在处理 ${converted.images.length} 张图片…`);
    const imageResults = new Map();
    for (const image of converted.images) {
      const response = await sendToCurrentTab({
        type: "FETCH_IMAGE",
        url: image.src,
        cacheId: image.cacheId,
      });
      if (response?.ok) {
        imageResults.set(image.id, {
          ok: true,
          blob: dataUrlToBlob(response.dataUrl),
          mimeType: response.mimeType,
        });
      } else {
        imageResults.set(image.id, { ok: false, error: response?.error || "图片读取失败" });
      }
    }

    showStatus("正在写入 Obsidian Vault…");
    const result = await saveArticleToVault({
      vaultHandle: state.vaultHandle,
      noteDirectory: elements.noteDirectory.value,
      attachmentDirectory: elements.attachmentDirectory.value,
      article: { ...converted, title },
      imageResults,
    });

    const imageSummary = converted.images.length
      ? `图片 ${result.savedImages} 张已保存${result.failedImages ? `，${result.failedImages} 张保留远程链接` : ""}。`
      : "文档中没有图片。";
    showStatus(`已保存：${result.notePath}。${imageSummary}`, result.failedImages ? "warning" : "success");
  } catch (error) {
    const message = errorMessage(error);
    showStatus(connectionErrorMessage(message), "error");
  } finally {
    if (startedArticleSave) await sendToCurrentTab({ type: "CLEAR_IMAGE_CACHE" }).catch(() => {});
    setBusy(false);
  }
}

function openSettings() {
  state.templateDraft = cloneProperties(state.template);
  state.settingsOpen = true;
  state.openMenuId = null;
  renderTemplateProperties();
  showSettingsStatus("");
  updateUi();
}

function cancelSettings() {
  state.templateDraft = [];
  state.settingsOpen = false;
  updateUi();
}

async function saveTemplateSettings() {
  try {
    const draftProperties = state.templateDraft
      .map((field) => ({ ...field, value: cloneDefaultValue(field.defaultValue) }));
    const errors = validateProperties(draftProperties);
    if (errors.length) {
      focusTemplateField(errors[0].id);
      throw new Error(errors[0].message);
    }
    parseRelativeDirectory(elements.noteDirectory.value);
    parseRelativeDirectory(elements.attachmentDirectory.value);

    state.template = cloneProperties(state.templateDraft);
    await chrome.storage.local.set({
      propertyTemplate: state.template,
      propertyTemplateVersion: PROPERTY_TEMPLATE_VERSION,
      noteDirectory: elements.noteDirectory.value.trim(),
      attachmentDirectory: elements.attachmentDirectory.value.trim(),
    });
    elements.quickNoteDirectory.value = elements.noteDirectory.value.trim();
    state.settingsOpen = false;
    updateUi();
    showStatus("模板设置已保存，将用于以后打开的文章。", "success");
  } catch (error) {
    showSettingsStatus(errorMessage(error), "error");
  }
}

function addCurrentProperty() {
  const key = nextPropertyKey(state.properties);
  state.properties.push({ id: createId(), key, label: key, type: "text", value: "" });
  renderProperties();
  focusPropertyField(state.properties.at(-1).id);
}

function addTemplateProperty() {
  const key = nextPropertyKey(state.templateDraft);
  state.templateDraft.push({
    id: createId(),
    key,
    label: key,
    type: "text",
    source: "none",
    defaultValue: "",
    enabled: true,
  });
  renderTemplateProperties();
  focusTemplateField(state.templateDraft.at(-1).id);
}

function handleTitleInput() {
  autoResizeTitle();
  const titleField = state.properties.find((field) => field.key === "title");
  if (titleField) {
    titleField.value = elements.title.value;
    renderProperties();
  }
}

function applyExtractedPublishedDate(publishedDate) {
  if (!publishedDate) return;
  const templateField = state.template.find((field) => field.enabled !== false && field.source === "publishedDate");
  const property = templateField && state.properties.find((field) => field.id === templateField.id);
  if (property && !property.value) property.value = publishedDate;
}

function renderProperties() {
  elements.propertiesList.replaceChildren(...state.properties.map(createPropertyRow));
}

function createPropertyRow(field) {
  const row = createElement("div", "property-row");
  row.dataset.id = field.id;

  const icon = createElement("span", "type-icon", TYPE_ICONS[field.type] || "≡");
  icon.setAttribute("aria-hidden", "true");
  const keyInput = createElement("input", "property-key");
  keyInput.setAttribute("aria-label", "属性名");
  keyInput.value = field.key;
  keyInput.addEventListener("input", () => {
    field.key = keyInput.value;
    clearFieldError(row);
  });
  keyInput.addEventListener("blur", () => {
    field.key = keyInput.value.trim();
    keyInput.value = field.key;
  });

  const valueControl = createValueControl(field.type, field.value, "property-value");
  valueControl.setAttribute("aria-label", `${field.label || field.key} 的值`);
  const valueEvent = field.type === "boolean" ? "change" : "input";
  valueControl.addEventListener(valueEvent, () => {
    try {
      field.value = coercePropertyValue(field.type, controlValue(valueControl));
      if (field.key.trim() === "title") {
        elements.title.value = String(field.value);
        autoResizeTitle();
      }
      clearFieldError(row);
    } catch (error) {
      showFieldError(row, errorMessage(error));
    }
  });

  const actions = createElement("div", "row-actions");
  const menuButton = createElement("button", "row-action", "⋯");
  menuButton.type = "button";
  menuButton.setAttribute("aria-label", `${field.key} 属性操作`);
  menuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    state.openMenuId = state.openMenuId === field.id ? null : field.id;
    renderProperties();
  });
  actions.append(menuButton);

  row.append(icon, keyInput, valueControl, actions);
  if (state.openMenuId === field.id) row.append(createPropertyMenu(field));
  const error = createElement("div", "field-error");
  error.hidden = true;
  row.append(error);
  return row;
}

function createPropertyMenu(field) {
  const menu = createElement("div", "row-menu");
  menu.addEventListener("click", (event) => event.stopPropagation());

  const typeSelect = createSelect(PROPERTY_TYPES, TYPE_LABELS, field.type, "属性类型");
  typeSelect.addEventListener("change", () => {
    const oldValue = field.value;
    field.type = typeSelect.value;
    try {
      field.value = coercePropertyValue(field.type, oldValue);
    } catch {
      field.value = emptyValueForType(field.type);
      showStatus("原值无法转换，已清空。", "warning");
    }
    state.openMenuId = null;
    renderProperties();
  });
  menu.append(typeSelect);
  menu.append(
    actionButton("上移", () => moveItem(state.properties, field.id, -1, renderProperties)),
    actionButton("下移", () => moveItem(state.properties, field.id, 1, renderProperties)),
    actionButton("删除属性", () => removeItem(state.properties, field.id, renderProperties), "danger"),
  );
  return menu;
}

function renderTemplateProperties() {
  elements.templatePropertiesList.replaceChildren(...state.templateDraft.map(createTemplateRow));
}

function createTemplateRow(field) {
  const row = createElement("article", "template-row");
  row.dataset.id = field.id;

  const head = createElement("div", "template-row-head");
  const enabledLabel = createElement("label", "enabled-field");
  const enabledInput = document.createElement("input");
  enabledInput.type = "checkbox";
  enabledInput.checked = field.enabled !== false;
  enabledInput.addEventListener("change", () => { field.enabled = enabledInput.checked; });
  enabledLabel.append(enabledInput, document.createTextNode("默认启用"));
  const headActions = createElement("div", "row-actions");
  headActions.append(
    compactAction("↑", "上移", () => moveItem(state.templateDraft, field.id, -1, renderTemplateProperties)),
    compactAction("↓", "下移", () => moveItem(state.templateDraft, field.id, 1, renderTemplateProperties)),
    compactAction("×", "删除", () => removeItem(state.templateDraft, field.id, renderTemplateProperties)),
  );
  head.append(enabledLabel, headActions);

  const fields = createElement("div", "template-fields");
  const keyInput = document.createElement("input");
  keyInput.value = field.key;
  keyInput.addEventListener("input", () => { field.key = keyInput.value; });
  const labelInput = document.createElement("input");
  labelInput.value = field.label || "";
  labelInput.addEventListener("input", () => { field.label = labelInput.value; });
  const typeSelect = createSelect(PROPERTY_TYPES, TYPE_LABELS, field.type, "属性类型");
  const sourceSelect = createSelect(PROPERTY_SOURCES, SOURCE_LABELS, field.source || "none", "自动取值来源");
  sourceSelect.addEventListener("change", () => { field.source = sourceSelect.value; });
  const defaultContainer = createElement("div", "template-field wide");
  defaultContainer.append(createElement("span", "", "默认值"));

  const rebuildDefaultControl = (oldValue = field.defaultValue) => {
    defaultContainer.querySelector(".template-default")?.remove();
    try {
      field.defaultValue = coercePropertyValue(field.type, oldValue);
    } catch {
      field.defaultValue = emptyValueForType(field.type);
      showSettingsStatus("原值无法转换，已清空。", "warning");
    }
    const control = createValueControl(field.type, field.defaultValue, "template-default");
    control.setAttribute("aria-label", `${field.key} 默认值`);
    control.addEventListener(field.type === "boolean" ? "change" : "input", () => {
      try { field.defaultValue = coercePropertyValue(field.type, controlValue(control)); }
      catch (error) { showStatus(errorMessage(error), "error"); }
    });
    defaultContainer.append(control);
  };
  typeSelect.addEventListener("change", () => {
    const oldValue = field.defaultValue;
    field.type = typeSelect.value;
    rebuildDefaultControl(oldValue);
  });
  rebuildDefaultControl();

  fields.append(
    labeledField("字段名", keyInput),
    labeledField("显示名称", labelInput),
    labeledField("类型", typeSelect),
    labeledField("自动取值", sourceSelect),
    defaultContainer,
  );
  row.append(head, fields);
  return row;
}

function renderPropertyErrors(errors) {
  elements.propertiesList.querySelectorAll(".field-error").forEach((element) => {
    element.textContent = "";
    element.hidden = true;
  });
  for (const error of errors) {
    const row = findRow(elements.propertiesList, error.id);
    if (row) showFieldError(row, error.message);
  }
}

function createValueControl(type, value, className) {
  if (type === "boolean") {
    const input = createElement("input", className);
    input.type = "checkbox";
    input.checked = value === true;
    return input;
  }
  const input = createElement("input", className);
  input.type = type === "date" ? "date" : type === "number" ? "number" : "text";
  if (type === "number") input.step = "any";
  input.value = type === "list" ? (Array.isArray(value) ? value.join(", ") : String(value ?? "")) : String(value ?? "");
  input.placeholder = type === "list" ? "用逗号分隔" : "空";
  return input;
}

function controlValue(control) {
  return control.type === "checkbox" ? control.checked : control.value;
}

function labeledField(label, control) {
  const wrapper = createElement("label", "template-field");
  wrapper.append(createElement("span", "", label), control);
  return wrapper;
}

function createSelect(values, labels, selected, ariaLabel) {
  const select = document.createElement("select");
  select.setAttribute("aria-label", ariaLabel);
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labels[value];
    option.selected = value === selected;
    select.append(option);
  }
  return select;
}

function actionButton(label, action, className = "") {
  const button = createElement("button", className, label);
  button.type = "button";
  button.addEventListener("click", () => {
    state.openMenuId = null;
    action();
  });
  return button;
}

function compactAction(label, ariaLabel, action) {
  const button = createElement("button", "row-action", label);
  button.type = "button";
  button.setAttribute("aria-label", ariaLabel);
  button.addEventListener("click", action);
  return button;
}

function moveItem(collection, id, offset, render) {
  const index = collection.findIndex((item) => item.id === id);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= collection.length) return;
  [collection[index], collection[target]] = [collection[target], collection[index]];
  render();
}

function removeItem(collection, id, render) {
  const index = collection.findIndex((item) => item.id === id);
  if (index >= 0) collection.splice(index, 1);
  render();
}

function focusPropertyField(id) {
  requestAnimationFrame(() => findRow(elements.propertiesList, id)?.querySelector(".property-key")?.focus());
}

function focusTemplateField(id) {
  requestAnimationFrame(() => findRow(elements.templatePropertiesList, id)?.querySelector("input")?.focus());
}

function findRow(container, id) {
  return Array.from(container.children).find((row) => row.dataset.id === id) ?? null;
}

function showFieldError(row, message) {
  const error = row.querySelector(".field-error");
  if (!error) return;
  error.textContent = message;
  error.hidden = false;
}

function clearFieldError(row) {
  const error = row.querySelector(".field-error");
  if (!error) return;
  error.textContent = "";
  error.hidden = true;
}

function normalizeTemplate(value) {
  const template = Array.isArray(value) && value.length ? value : createDefaultTemplate();
  return template.map((field) => {
    const type = PROPERTY_TYPES.includes(field.type) ? field.type : "text";
    let defaultValue;
    try { defaultValue = coercePropertyValue(type, field.defaultValue ?? emptyValueForType(type)); }
    catch { defaultValue = emptyValueForType(type); }
    return {
      id: field.id || createId(),
      key: String(field.key ?? ""),
      label: String(field.label || field.key || ""),
      type,
      source: PROPERTY_SOURCES.includes(field.source) ? field.source : "none",
      defaultValue,
      enabled: field.enabled !== false,
    };
  });
}

function updateUi() {
  elements.editorView.hidden = state.settingsOpen;
  elements.settingsView.hidden = !state.settingsOpen;
  elements.actionDock.hidden = state.settingsOpen;
  elements.vaultName.textContent = state.vaultHandle?.name || "尚未选择";
  elements.changeVault.disabled = state.busy;
  elements.saveSettings.disabled = state.busy;

  if (!state.vaultHandle) {
    elements.primary.textContent = "选择 Obsidian Vault";
    elements.primary.disabled = state.busy;
  } else if (state.permission !== "granted") {
    elements.primary.textContent = "恢复 Vault 授权";
    elements.primary.disabled = state.busy;
  } else {
    elements.primary.textContent = state.busy ? "正在保存…" : "添加到 Obsidian";
    elements.primary.disabled = state.busy || !validateFeishuUrl(state.tab?.url);
  }
  autoResizeTitle();
}

function setBusy(value, statusMessage) {
  state.busy = value;
  if (statusMessage) showStatus(statusMessage);
  updateUi();
}

async function persistDirectories() {
  await chrome.storage.local.set({
    noteDirectory: elements.noteDirectory.value.trim(),
    attachmentDirectory: elements.attachmentDirectory.value.trim(),
  });
}

async function sendToCurrentTab(message) {
  if (!state.tab?.id) throw new Error("无法确定当前标签页");
  return chrome.tabs.sendMessage(state.tab.id, message);
}

function htmlToPreviewText(html) {
  const parsed = new DOMParser().parseFromString(`<div>${html || ""}</div>`, "text/html");
  const container = parsed.body.firstElementChild;
  const text = String(container?.innerText || container?.textContent || "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || "正文为空";
}

function autoResizeTitle() {
  elements.title.style.height = "auto";
  elements.title.style.height = `${Math.max(72, elements.title.scrollHeight)}px`;
}

function showStatus(message, type = "") {
  elements.status.textContent = message;
  elements.status.className = `status${type ? ` ${type}` : ""}`;
  elements.status.title = message;
}

function showSettingsStatus(message, type = "") {
  elements.settingsStatus.textContent = message;
  elements.settingsStatus.className = `settings-status${type ? ` ${type}` : ""}`;
}

function connectionErrorMessage(message) {
  return /Receiving end does not exist|Could not establish connection/.test(message)
    ? "插件尚未注入当前页面，请刷新飞书页面后重试。"
    : message;
}

function createElement(tagName, className = "", text = "") {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `property-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cloneDefaultValue(value) {
  return Array.isArray(value) ? [...value] : value;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "发生未知错误");
}
