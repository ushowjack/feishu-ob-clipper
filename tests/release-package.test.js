import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

import {
  normalizeTag,
  validateArchiveEntries,
  validateVersions,
} from "../scripts/release-package-core.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("removes the v prefix from a semantic version tag", () => {
  assert.equal(normalizeTag("v0.1.0"), "0.1.0");
});

test("accepts matching tag, package, and manifest versions", () => {
  assert.equal(
    validateVersions({
      tag: "v0.1.0",
      packageVersion: "0.1.0",
      manifestVersion: "0.1.0",
    }),
    "0.1.0",
  );
});

test("rejects mismatched release versions", () => {
  assert.throws(
    () =>
      validateVersions({
        tag: "v0.1.1",
        packageVersion: "0.1.0",
        manifestVersion: "0.1.0",
      }),
    /版本不一致/,
  );
});

test("accepts a flat extension archive containing only runtime files", () => {
  assert.doesNotThrow(() =>
    validateArchiveEntries([
      "manifest.json",
      "popup.html",
      "popup.css",
      "src/content.js",
      "src/vault.js",
    ]),
  );
});

test("rejects an archive nested below a project directory", () => {
  assert.throws(
    () => validateArchiveEntries(["feishu-ob-clipper/manifest.json"]),
    /不允许的文件/,
  );
});

test("rejects an archive missing a required runtime file", () => {
  assert.throws(
    () => validateArchiveEntries(["manifest.json", "popup.html", "src/content.js"]),
    /缺少必需文件.*popup\.css/,
  );
});

test("rejects development files in an archive", () => {
  assert.throws(
    () =>
      validateArchiveEntries([
        "manifest.json",
        "popup.html",
        "popup.css",
        "src/content.js",
        "README.md",
      ]),
    /不允许的文件.*README\.md/,
  );
});

test("packages the extension as a versioned flat ZIP", () => {
  const archive = path.join(
    projectRoot,
    "dist",
    "feishu-ob-clipper-v0.1.0.zip",
  );
  rmSync(path.dirname(archive), { recursive: true, force: true });

  execFileSync(process.execPath, ["scripts/package-release.mjs"], {
    cwd: projectRoot,
    env: { ...process.env, RELEASE_TAG: "v0.1.0" },
    stdio: "pipe",
  });

  assert.equal(existsSync(archive), true);
  const entries = execFileSync("unzip", ["-Z1", archive], {
    encoding: "utf8",
  })
    .trim()
    .split("\n");
  validateArchiveEntries(entries);
  assert.equal(entries.includes("manifest.json"), true);
});
