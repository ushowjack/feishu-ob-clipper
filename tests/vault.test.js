import test from "node:test";
import assert from "node:assert/strict";

import {
  queryVaultPermission,
  requestVaultPermission,
  saveArticleToVault,
} from "../src/vault.js";
import { fakeVault } from "./support/fake-filesystem.js";

test("创建子目录、保存图片并且不覆盖同名笔记", async () => {
  const fs = fakeVault({ "notes/标题.md": "旧内容" });
  const result = await saveArticleToVault({
    vaultHandle: fs.root,
    noteDirectory: "notes",
    attachmentDirectory: "assets/feishu",
    article: {
      title: "标题",
      markdown: "正文 @@FEISHU_IMAGE_1@@",
      images: [{ id: 1, src: "https://x/image", alt: "图片" }],
    },
    imageResults: new Map([
      [1, { ok: true, blob: new Blob(["png"], { type: "image/png" }), mimeType: "image/png" }],
    ]),
  });

  assert.equal(result.notePath, "notes/标题-2.md");
  assert.equal(fs.read("notes/标题.md"), "旧内容");
  assert.match(fs.read("notes/标题-2.md"), /!\[\[assets\/feishu\/标题-2-01.png\]\]/);
  assert.equal(fs.read("assets/feishu/标题-2-01.png"), "png");
  assert.equal(result.savedImages, 1);
  assert.equal(result.failedImages, 0);
});

test("图片失败时保留远程链接并返回警告", async () => {
  const fs = fakeVault();
  const result = await saveArticleToVault({
    vaultHandle: fs.root,
    noteDirectory: "",
    attachmentDirectory: "attachments/feishu",
    article: {
      title: "标题",
      markdown: "@@FEISHU_IMAGE_1@@",
      images: [{ id: 1, src: "https://x/image?a=1", alt: "示意[图]" }],
    },
    imageResults: new Map([[1, { ok: false, error: "403" }]]),
  });

  assert.match(fs.read("标题.md"), /!\[示意\\\[图\\\]\]\(https:\/\/x\/image\?a=1\)/);
  assert.equal(result.failedImages, 1);
  assert.equal(result.warnings.length, 1);
});

test("根据 MIME 类型选择受支持的图片扩展名", async () => {
  const fs = fakeVault();
  await saveArticleToVault({
    vaultHandle: fs.root,
    noteDirectory: "",
    attachmentDirectory: "assets",
    article: {
      title: "标题",
      markdown: "@@FEISHU_IMAGE_1@@",
      images: [{ id: 1, src: "https://x/image", alt: "图" }],
    },
    imageResults: new Map([[1, { ok: true, blob: new Blob(["webp"]), mimeType: "image/webp" }]]),
  });
  assert.equal(fs.has("assets/标题-01.webp"), true);
});

test("网格图片写入为带样式的 HTML 图片而普通图片保持 Wiki 嵌入", async () => {
  const fs = fakeVault();
  await saveArticleToVault({
    vaultHandle: fs.root,
    noteDirectory: "notes",
    attachmentDirectory: "assets",
    article: {
      title: "网格",
      markdown: '<div class="feishu-image-grid">@@FEISHU_GRID_IMAGE_1@@</div>\n\n@@FEISHU_IMAGE_2@@',
      images: [
        { id: 1, src: "https://x/large", alt: "大图", layout: "grid" },
        { id: 2, src: "https://x/normal", alt: "普通图" },
      ],
    },
    imageResults: new Map([
      [1, { ok: true, blob: new Blob(["large"], { type: "image/png" }), mimeType: "image/png" }],
      [2, { ok: true, blob: new Blob(["normal"], { type: "image/png" }), mimeType: "image/png" }],
    ]),
  });

  const note = await fs.read("notes/网格.md");
  assert.match(note, /<img class="feishu-image" src="\.\.\/assets\/%E7%BD%91%E6%A0%BC-01\.png" alt="大图"/);
  assert.match(note, /!\[\[assets\/网格-02\.png\]\]/);
});

test("同一图片的普通与网格占位符分别写入 Wiki 嵌入和 HTML 图片", async () => {
  const fs = fakeVault();
  await saveArticleToVault({
    vaultHandle: fs.root,
    noteDirectory: "notes",
    attachmentDirectory: "assets#grid",
    article: {
      title: "混排",
      markdown: '@@FEISHU_IMAGE_1@@\n<div class="feishu-image-grid">@@FEISHU_GRID_IMAGE_1@@</div>',
      images: [{ id: 1, src: "https://x/same", alt: "同一张图" }],
    },
    imageResults: new Map([
      [1, { ok: true, blob: new Blob(["same"], { type: "image/png" }), mimeType: "image/png" }],
    ]),
  });

  const note = await fs.read("notes/混排.md");
  assert.match(note, /!\[\[assets%23grid\/混排-01\.png\]\]/);
  assert.match(note, /<img class="feishu-image" src="\.\.\/assets%23grid\/%E6%B7%B7%E6%8E%92-01\.png"/);
});

test("查询和请求目录写权限", async () => {
  const handle = {
    queryPermission: async ({ mode }) => mode === "readwrite" ? "prompt" : "denied",
    requestPermission: async ({ mode }) => mode === "readwrite" ? "granted" : "denied",
  };
  assert.equal(await queryVaultPermission(handle), "prompt");
  assert.equal(await requestVaultPermission(handle), true);
  assert.equal(await queryVaultPermission(null), "denied");
});
