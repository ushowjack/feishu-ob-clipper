import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  RELEASE_PATHS,
  validateArchiveEntries,
  validateVersions,
} from "./release-package-core.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageJson = JSON.parse(
  readFileSync(path.join(projectRoot, "package.json"), "utf8"),
);
const manifest = JSON.parse(
  readFileSync(path.join(projectRoot, "manifest.json"), "utf8"),
);
const releaseTag = process.env.RELEASE_TAG ?? `v${packageJson.version}`;
const version = validateVersions({
  tag: releaseTag,
  packageVersion: packageJson.version,
  manifestVersion: manifest.version,
});

const distDirectory = path.join(projectRoot, "dist");
const stagingDirectory = path.join(distDirectory, "staging");
const archivePath = path.join(
  distDirectory,
  `feishu-ob-clipper-v${version}.zip`,
);

rmSync(distDirectory, { recursive: true, force: true });
mkdirSync(stagingDirectory, { recursive: true });

for (const releasePath of RELEASE_PATHS) {
  cpSync(
    path.join(projectRoot, releasePath),
    path.join(stagingDirectory, releasePath),
    { recursive: true },
  );
}

execFileSync("zip", ["-q", "-r", archivePath, ...RELEASE_PATHS], {
  cwd: stagingDirectory,
});

const entries = execFileSync("unzip", ["-Z1", archivePath], {
  encoding: "utf8",
})
  .trim()
  .split("\n");
validateArchiveEntries(entries);
rmSync(stagingDirectory, { recursive: true, force: true });

console.log(`已生成 ${path.relative(projectRoot, archivePath)}`);
