const SEMVER_PATTERN = /^v?(\d+\.\d+\.\d+)$/;

export const RELEASE_PATHS = Object.freeze([
  "manifest.json",
  "popup.html",
  "popup.css",
  "src",
]);

const REQUIRED_FILES = ["manifest.json", "popup.html", "popup.css"];

export function normalizeTag(tag) {
  const match = SEMVER_PATTERN.exec(tag);
  if (!match) {
    throw new Error(`版本标签格式无效：${tag}`);
  }
  return match[1];
}

export function validateVersions({ tag, packageVersion, manifestVersion }) {
  const normalizedTag = normalizeTag(tag);
  if (
    normalizedTag !== packageVersion ||
    normalizedTag !== manifestVersion
  ) {
    throw new Error(
      `版本不一致：tag=${normalizedTag}, package=${packageVersion}, manifest=${manifestVersion}`,
    );
  }
  return normalizedTag;
}

export function validateArchiveEntries(entries) {
  const files = entries.filter((entry) => entry && !entry.endsWith("/"));

  const invalidEntry = files.find(
    (entry) =>
      !REQUIRED_FILES.includes(entry) && !/^src\/[^/]+\.js$/.test(entry),
  );
  if (invalidEntry) {
    throw new Error(`ZIP 包含不允许的文件：${invalidEntry}`);
  }

  for (const requiredFile of REQUIRED_FILES) {
    if (!files.includes(requiredFile)) {
      throw new Error(`ZIP 缺少必需文件：${requiredFile}`);
    }
  }

  if (!files.some((entry) => /^src\/[^/]+\.js$/.test(entry))) {
    throw new Error("ZIP 缺少必需文件：src/*.js");
  }
}
