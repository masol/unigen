// packages/main/src/libs/coderuntime/engines/nodejs.reg.ts
//
// Node.js 运行时注册表：
//   - 版本号；
//   - 镜像（官方 + 中国区）；
//   - 平台-架构 → 归档文件名 key；
//   - 归档 SHA256（对应版本，镜像与官方内容一致，可复用）。

/** 当前固定的 Node.js 版本。升级时同步更新 NODE_ARCHIVE_SHA256。 */
export const NODE_VERSION = "26.13.1";

/** 归档下载 base URL；实际拼接 `<base>/v<version>/<filename>`。 */
export const NODE_DIST_BASE = {
    official: "https://nodejs.org/dist",
    china: [
        "https://mirrors.tuna.tsinghua.edu.cn/nodejs-release",
        "https://mirrors.ustc.edu.cn/node",
    ],
} as const;

/** 平台-架构 → 归档文件名 key（`node-v<ver>-<key>.zip/tar.gz`）。 */
export const NODE_PLATFORM_KEYS: Record<string, string> = {
    "win32-x64": "win-x64",
    "win32-arm64": "win-arm64",
    "darwin-x64": "darwin-x64",
    "darwin-arm64": "darwin-arm64",
    "linux-x64": "linux-x64",
    "linux-arm64": "linux-arm64",
};

/**
 * 归档 SHA256（对应 `NODE_VERSION`）。
 *
 * 来源：官方 SHASUMS256.txt；镜像与官方内容一致，因此中国区也可用。
 * 只有在 registry 版本号与归档实际版本一致时才有效；升级版本时
 * **必须** 同步更新此表，否则校验必然失败。
 */
export const NODE_ARCHIVE_SHA256: Record<string, string> = {
    "win32-x64":
        "e2edda75bfb089654705cf65a13b58933bfd5f57148e8ebda916f58a2474f1f7",
    "win32-arm64":
        "181ebe431b90787113a9e4fc80d38ce86d37888a353a0386de44d2872e48cb97",
    "darwin-x64":
        "82bb96078a24ca50b9c9a38f2379e6be6d87171fcd400fc14c8934b3bce96e2f",
    "darwin-arm64":
        "aec2514ea1ceb2ba52455e9ec65986f6749a06dd759e5db2a72e6889668c9735",
    "linux-x64":
        "518674de2b621728a5e4486f5fb3b7d2900bb3cc4aa97969edaa463db99f9778",
    "linux-arm64":
        "80a330b35415382878df18d41afbd106ea89bfb3be0087d6608e289a14c5cc7d",
};

/** Windows 用 zip；其余平台用 tar.gz（官方的 .tar.xz 判断有兼容性风险）。 */
export function nodeArchiveExt(platform: NodeJS.Platform): "zip" | "tar.gz" {
    return platform === "win32" ? "zip" : "tar.gz";
}

/** 归档解压后内层根目录名（作为 stripPrefix）。 */
export function nodeArchiveRootDir(platformKey: string): string {
    return `node-v${NODE_VERSION}-${platformKey}`;
}

/**
 * npm registry 镜像。
 *
 * 中国区**仅**在这些镜像之间测速选择（明确排除官方源）。
 */
export const NPM_REGISTRY_MIRRORS = {
    official: "https://registry.npmjs.org",
    china: [
        "https://mirrors.cloud.tencent.com/npm/",
        "https://r.cnpmjs.org/",
        "https://registry.npmmirror.com/",
        "https://repo.huaweicloud.com/repository/npm/",
    ],
} as const;