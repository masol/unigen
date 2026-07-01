import pkg from "./package.json" with { type: "json" };
import mapWorkspaces from "@npmcli/map-workspaces";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import fg from "fast-glob";
import { readFile } from "node:fs/promises";

export default /** @type import('electron-builder').Configuration */
({
  directories: {
    output: "dist",
    buildResources: "buildResources",
  },
  generateUpdatesFilesForAllChannels: true,
  linux: {
    target: ["deb"],
  },
  /**
   * It is recommended to avoid using non-standard characters such as spaces in artifact names,
   * as they can unpredictably change during deployment, making them impossible to locate and download for update.
   */
  artifactName: "${productName}-${version}-${os}-${arch}.${ext}",
  files: [
    "LICENSE*",
    pkg.main,
    "!node_modules/@app/**",
    // 1️⃣ 使用 **/ 匹配子 packages 下的 node_modules
    "**/node_modules/better-sqlite3/**/*",
    "**/node_modules/@lancedb/**/*",
    "**/node_modules/node-llama-cpp/**/*",
    ...(await getListOfFilesFromEachWorkspace()),
  ],
  asar: true,
  asarUnpack: [
    "**/node_modules/better-sqlite3/**/*",
    "**/node_modules/@lancedb/**/*",
    "**/node_modules/node-llama-cpp/**/*",
  ],
  extraResources: [
    {
      from: "packages/main/src/libs/utils/db/migrations",
      to: "drizzle",
    },
  ],
});

/**
 * By default, electron-builder copies each package into the output compilation entirety,
 * including the source code, tests, configuration, assets, and any other files.
 *
 * So you may get compiled app structure like this:
 * ```
 * app/
 * ├── node_modules/
 * │   └── workspace-packages/
 * │       ├── package-a/
 * │       │   ├── src/            # Garbage. May be safely removed
 * │       │   ├── dist/
 * │       │   │   └── index.js    # Runtime code
 * │       │   ├── vite.config.js  # Garbage
 * │       │   ├── .env            # some sensitive config
 * │       │   └── package.json
 * │       ├── package-b/
 * │       ├── package-c/
 * │       └── package-d/
 * ├── packages/
 * │   └── entry-point.js
 * └── package.json
 * ```
 *
 * To prevent this, we read the “files”
 * property from each package's package.json
 * and add all files that do not match the patterns to the exclusion list.
 *
 * This way,
 * each package independently determines which files will be included in the final compilation and which will not.
 *
 * So if `package-a` in its `package.json` describes
 * ```json
 * {
 *   "name": "package-a",
 *   "files": [
 *     "dist/**\/"
 *   ]
 * }
 * ```
 *
 * Then in the compilation only those files and `package.json` will be included:
 * ```
 * app/
 * ├── node_modules/
 * │   └── workspace-packages/
 * │       ├── package-a/
 * │       │   ├── dist/
 * │       │   │   └── index.js    # Runtime code
 * │       │   └── package.json
 * │       ├── package-b/
 * │       ├── package-c/
 * │       └── package-d/
 * ├── packages/
 * │   └── entry-point.js
 * └── package.json
 * ```
 */

async function getListOfFilesFromEachWorkspace() {
  // 1. 直接硬编码工作区目录,无需解析pnpm-workspace.yaml。因此无需引入fast-glob以及yaml库了。
  const workspaceDirs = [
    "packages/main",
    "packages/electron-versions",
    "packages/integrate-renderer",
    "packages/preload",
    "packages/renderer",
  ];

  const allFilesToInclude = [];

  for (const dir of workspaceDirs) {
    // 2. 假设每个子目录下都有 package.json
    const pkgPath = join(process.cwd(), dir, "package.json");

    try {
      const { default: workspacePkg } = await import(pathToFileURL(pkgPath), {
        with: { type: "json" },
      });

      // 3. 提取 files 配置，如果没有则使用默认值
      const patterns = workspacePkg.files ?? ["dist/**", "package.json"];

      // 4. 拼接 node_modules 路径并收集
      allFilesToInclude.push(
        ...patterns.map((pattern) =>
          join("node_modules", workspacePkg.name, pattern),
        ),
      );
    } catch (err) {
      // 容错：如果某个目录下没有 package.json，跳过即可
      console.warn(`Skipping ${dir}: No valid package.json found.`);
    }
  }

  return allFilesToInclude;
}
