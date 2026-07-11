import { loadDirectoryHandle, saveDirectoryHandle } from "./handle-store.js";
import { convertArticle } from "./markdown.js";
import {
  dataUrlToBlob,
  localIsoTimestamp,
  shouldPreserveStatus,
  validateFeishuUrl,
} from "./popup-core.js";
import { parseRelativeDirectory } from "./path-utils.js";
import {
  queryVaultPermission,
  requestVaultPermission,
  saveArticleToVault,
} from "./vault.js";

const elements = {
  title: document.querySelector("#document-title"),
  vaultName: document.querySelector("#vault-name"),
  badge: document.querySelector("#permission-badge"),
  noteDirectory: document.querySelector("#note-directory"),
  attachmentDirectory: document.querySelector("#attachment-directory"),
  status: document.querySelector("#status"),
  primary: document.querySelector("#primary-button"),
  changeVault: document.querySelector("#change-vault"),
};

const state = {
  tab: null,
  vaultHandle: null,
  permission: "denied",
  busy: false,
};

elements.primary.addEventListener("click", handlePrimaryAction);
elements.changeVault.addEventListener("click", chooseVault);
elements.noteDirectory.addEventListener("change", persistSettings);
elements.attachmentDirectory.addEventListener("change", persistSettings);

initialize().catch((error) => showStatus(errorMessage(error), "error"));

async function initialize() {
  const [[tab], settings, handle] = await Promise.all([
    chrome.tabs.query({ active: true, currentWindow: true }),
    chrome.storage.local.get({ noteDirectory: "", attachmentDirectory: "attachments/feishu" }),
    loadDirectoryHandle().catch(() => null),
  ]);
  state.tab = tab ?? null;
  state.vaultHandle = handle;
  elements.title.textContent = tab?.title || "当前页面";
  elements.title.title = tab?.title || "";
  elements.noteDirectory.value = settings.noteDirectory;
  elements.attachmentDirectory.value = settings.attachmentDirectory;
  state.permission = handle ? await queryVaultPermission(handle) : "denied";
  updateUi();
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
    if (!granted) showStatus("Vault 写入授权未恢复，请重新选择目录。", "error");
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
    showStatus("Vault 已选择，现在可以保存当前飞书文档。", "success");
    updateUi();
  } catch (error) {
    if (error?.name !== "AbortError") showStatus(`选择 Vault 失败：${errorMessage(error)}`, "error");
  }
}

async function saveCurrentArticle() {
  if (!validateFeishuUrl(state.tab?.url)) {
    showStatus("请先打开一个飞书 Wiki 或文档页面。", "error");
    return;
  }

  try {
    setBusy(true, "正在读取飞书正文…");
    parseRelativeDirectory(elements.noteDirectory.value);
    parseRelativeDirectory(elements.attachmentDirectory.value);
    await persistSettings();

    const extracted = await sendToCurrentTab({ type: "EXTRACT_ARTICLE" });
    if (!extracted?.ok) throw new Error(extracted?.error || "读取飞书正文失败");

    const parsed = new DOMParser().parseFromString(`<div>${extracted.article.html}</div>`, "text/html");
    const root = parsed.body.firstElementChild;
    if (!root) throw new Error("飞书正文结构为空");
    const converted = convertArticle(root, {
      title: extracted.article.title,
      sourceUrl: extracted.article.url,
      capturedAt: localIsoTimestamp(),
    });

    showStatus(`正在处理 ${converted.images.length} 张图片…`);
    const imageResults = new Map();
    for (const image of converted.images) {
      const response = await sendToCurrentTab({ type: "FETCH_IMAGE", url: image.src });
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
      article: { ...converted, title: extracted.article.title },
      imageResults,
    });

    const imageSummary = converted.images.length
      ? `图片 ${result.savedImages} 张已保存${result.failedImages ? `，${result.failedImages} 张保留远程链接` : ""}。`
      : "文档中没有图片。";
    showStatus(`已保存：${result.notePath}。${imageSummary}`, result.failedImages ? "warning" : "success");
  } catch (error) {
    const message = errorMessage(error);
    if (/Receiving end does not exist|Could not establish connection/.test(message)) {
      showStatus("插件尚未注入当前页面，请刷新飞书页面后重试。", "error");
    } else {
      showStatus(message, "error");
    }
  } finally {
    setBusy(false);
  }
}

async function persistSettings() {
  await chrome.storage.local.set({
    noteDirectory: elements.noteDirectory.value.trim(),
    attachmentDirectory: elements.attachmentDirectory.value.trim(),
  });
}

async function sendToCurrentTab(message) {
  if (!state.tab?.id) throw new Error("无法确定当前标签页");
  return chrome.tabs.sendMessage(state.tab.id, message);
}

function setBusy(value, statusMessage) {
  state.busy = value;
  if (statusMessage) showStatus(statusMessage);
  updateUi();
}

function updateUi() {
  const supported = validateFeishuUrl(state.tab?.url);
  elements.vaultName.textContent = state.vaultHandle?.name || "尚未选择";
  elements.badge.textContent = state.permission === "granted" ? "可写入" : state.vaultHandle ? "需授权" : "未授权";
  elements.badge.classList.toggle("granted", state.permission === "granted");
  elements.changeVault.disabled = state.busy;

  if (!state.vaultHandle) {
    elements.primary.textContent = "选择 Obsidian Vault";
    elements.primary.disabled = state.busy;
  } else if (state.permission !== "granted") {
    elements.primary.textContent = "恢复 Vault 授权";
    elements.primary.disabled = state.busy;
  } else {
    elements.primary.textContent = state.busy ? "正在保存…" : "保存到 Obsidian";
    elements.primary.disabled = state.busy || !supported;
  }

  if (!state.busy && state.vaultHandle && state.permission === "granted" && !supported) {
    showStatus("当前不是受支持的飞书 Wiki/文档页面。", "error");
  } else if (!state.busy && state.vaultHandle && state.permission === "granted" && supported && !shouldPreserveStatus(elements.status.className)) {
    showStatus("准备就绪，点击即可保存当前文档。");
  }
}

function showStatus(message, type = "") {
  elements.status.textContent = message;
  elements.status.className = `status${type ? ` ${type}` : ""}`;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "发生未知错误");
}
