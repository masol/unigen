// packages/main/src/libs/coderuntime/engines/aria2.reg.ts
//
// aria2 运行时注册表。
//
// 官方 Release 只提供 Windows 二进制与 Android 构建；桌面 Linux / macOS
// 没有可直接下载的独立二进制，因此**托管安装**只声明 Windows x64 / ia32。
//
// Linux / macOS 不走托管安装，改由 `aria2.ts` 探测系统已安装的 aria2c
// （`EngineRuntimeHandler.detectSystemExecutable`）；未安装时由
// `getMissingRuntimeMessage()` 提示用户自行安装后重新启用。
// 不支持的平台不做“源码编译”这类副作用路径。

/** 当前固定的 aria2 版本。 */
export const ARIA2_VERSION = "1.37.0";

/** GitHub Release tag 与下载 base。 */
const ARIA2_RELEASE_TAG = `release-${ARIA2_VERSION}`;
export const ARIA2_RELEASE_BASE =
    `https://github.com/aria2/aria2/releases/download/${ARIA2_RELEASE_TAG}`;

export interface Aria2Asset {
    /** Release 资产文件名。 */
    filename: string;
    /** 解压后根目录名（用于 stripPrefix）。 */
    rootDir: string;
    /** 解压后入口可执行文件相对路径。 */
    executable: string;
}

/**
 * 平台-架构 → aria2 官方 Release 资产（**托管安装**使用）。
 *
 * 注意：
 *   - Node.js 的 32 位 Windows 架构名是 `ia32`，不是 `x86`；
 *   - `aarch64-linux-android` 是 Android 构建，不是桌面 Linux 运行时，
 *     当前不纳入支持范围；
 *   - macOS / Linux 桌面没有官方独立二进制，故不在此表内：这两个平台
 *     使用系统已安装的 aria2c；未安装时 `getMissingRuntimeMessage()` 会
 *     提示用户自行安装后重新启用；
 *   - Windows ARM64 同样没有官方资产，`hasDefaultArchive()` 为 false，
 *     `getMissingRuntimeMessage()` 会提示配置 `archiveUrl`。
 */
export const ARIA2_ASSETS: Record<string, Aria2Asset> = {
    "win32-x64": {
        filename: `aria2-${ARIA2_VERSION}-win-64bit-build1.zip`,
        rootDir: `aria2-${ARIA2_VERSION}-win-64bit-build1`,
        executable: "aria2c.exe",
    },
    "win32-ia32": {
        filename: `aria2-${ARIA2_VERSION}-win-32bit-build1.zip`,
        rootDir: `aria2-${ARIA2_VERSION}-win-32bit-build1`,
        executable: "aria2c.exe",
    }
};

export function resolveAria2Asset(
    platform: NodeJS.Platform,
    arch: NodeJS.Architecture,
): Aria2Asset | undefined {
    return ARIA2_ASSETS[`${platform}-${arch}`];
}