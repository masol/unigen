// packages/main/src/libs/coderuntime/engines/ffmpeg.reg.ts
//
// FFmpeg 运行时注册表。
//
// 背景：FFmpeg 官方只发布源码与构建脚本，**不提供**桌面便携二进制。
// 因此托管安装使用两类社区构建，二者**目录布局完全不同**：
//
//   1. Jellyfin 便携构建（win32 / darwin / linux 全平台可用）
//      - Windows 为 .zip，其余平台为 .tar.xz；
//      - 解压后 `ffmpeg` / `ffmpeg.exe` **平铺**在归档根目录；
//      - 体积更小；国内镜像（mirror4.nyist.edu.cn）速度最好。
//
//   2. npm 镜像（npmmirror binaries）上的 ffmpeg-builds（仅 win32 / linux）
//      - 统一为 .tar.xz；
//      - 二进制埋在**二级目录**里，目录名 / 层级由构建脚本决定；
//      - 由引擎在解压后递归定位（`locateExecutable`），不依赖固定前缀。
//
// 两类布局的路径规则不同，所以这里为每个平台-架构同时声明
// “Jellyfin 相对路径”和“npm 相对路径”，完整 URL 由引擎按区域拼装。
// 新增平台 / 升级版本时只需修改本文件。

/** FFmpeg 主版本（npm 镜像的目录名与文件名都使用它）。 */
export const FFMPEG_VERSION = "8.1.3";

/** Jellyfin 构建号（含构建修订号，**不等于** FFMPEG_VERSION）。 */
export const FFMPEG_JELLYFIN_BUILD = "8.1.3-2";

/** Jellyfin 仓库的大版本目录（`windows/8.x/...`）。 */
export const FFMPEG_JELLYFIN_SERIES = "8.x";

/**
 * 下载 base。
 *
 * - `jellyfinOfficial`：Jellyfin 官方文件仓库（**非 GitHub**，不需要代理）；
 * - `jellyfinChina`   ：上述仓库的国内镜像，中国区优先；
 * - `npmMirror`       ：npmmirror 的 binaries CDN（全球可达）。
 *
 * ⚠️ 关于 `jellyfinOfficial`：其路径结构由 mirror4 的镜像路径反推得到
 * （`/jellyfin/files/ffmpeg/...` ↔ `/files/ffmpeg/...`）。若上游调整目录
 * 结构，该源会 404，下载器的多源 failover 会自动跳到 `npmMirror`，
 * 不会让安装整体失败（仅多花一次探测时间）。
 */
export const FFMPEG_DIST_BASE = {
    jellyfinOfficial: "https://repo.jellyfin.org/files/ffmpeg",
    jellyfinChina: "https://mirror4.nyist.edu.cn/jellyfin/files/ffmpeg",
    npmMirror:
        `https://cdn.npmmirror.com/binaries/ffmpeg-builds/v${FFMPEG_VERSION}`,
} as const;

export interface FfmpegAsset {
    /**
     * 归档内入口可执行文件名。
     *
     * 解压后递归定位时使用（`locateExecutable`）；与
     * `getDefaultExecutableRelativePath()` 的约定值一致，但显式声明可以
     * 让“归档内的真实文件名”成为数据而不是散落在代码里的字符串。
     */
    binaryName: string;
    /** Jellyfin 构建：相对 `jellyfin*` base 的路径。 */
    jellyfinPath: string;
    /** npm 构建：相对 `npmMirror` base 的路径；该平台无 npm 构建时缺省。 */
    npmPath?: string;
}

/**
 * 平台-架构 → 归档描述。
 *
 * 说明：
 *   - `win32-ia32`（32 位 Windows）与 `linux-armv7` 均无可用构建，不纳入；
 *   - macOS 没有 npm 构建（只有 Jellyfin）；
 *   - Windows / Linux 同时有两类构建，互为备份源。
 */
export const FFMPEG_ASSETS: Record<string, FfmpegAsset> = {
    "win32-x64": {
        binaryName: "ffmpeg.exe",
        jellyfinPath:
            `windows/${FFMPEG_JELLYFIN_SERIES}/${FFMPEG_JELLYFIN_BUILD}/win64/` +
            `jellyfin-ffmpeg_${FFMPEG_JELLYFIN_BUILD}_portable_win64-clang-gpl.zip`,
        npmPath: `ffmpeg-${FFMPEG_VERSION}-win32-x64-gpl.tar.xz`,
    },
    "win32-arm64": {
        binaryName: "ffmpeg.exe",
        jellyfinPath:
            `windows/${FFMPEG_JELLYFIN_SERIES}/${FFMPEG_JELLYFIN_BUILD}/winarm64/` +
            `jellyfin-ffmpeg_${FFMPEG_JELLYFIN_BUILD}_portable_winarm64-clang-gpl.zip`,
        npmPath: `ffmpeg-${FFMPEG_VERSION}-win32-arm64-gpl.tar.xz`,
    },
    "darwin-x64": {
        binaryName: "ffmpeg",
        jellyfinPath:
            `macos/${FFMPEG_JELLYFIN_SERIES}/${FFMPEG_JELLYFIN_BUILD}/x86_64/` +
            `jellyfin-ffmpeg_${FFMPEG_JELLYFIN_BUILD}_portable_mac64-gpl.tar.xz`,
        // npm binaries 没有 macOS 构建。
    },
    "darwin-arm64": {
        binaryName: "ffmpeg",
        jellyfinPath:
            `macos/${FFMPEG_JELLYFIN_SERIES}/${FFMPEG_JELLYFIN_BUILD}/arm64/` +
            `jellyfin-ffmpeg_${FFMPEG_JELLYFIN_BUILD}_portable_macarm64-gpl.tar.xz`,
    },
    "linux-x64": {
        binaryName: "ffmpeg",
        jellyfinPath:
            `linux/${FFMPEG_JELLYFIN_SERIES}/${FFMPEG_JELLYFIN_BUILD}/amd64/` +
            `jellyfin-ffmpeg_${FFMPEG_JELLYFIN_BUILD}_portable_linux64-gpl.tar.xz`,
        npmPath: `ffmpeg-${FFMPEG_VERSION}-linux-x64-gpl.tar.xz`,
    },
    "linux-arm64": {
        binaryName: "ffmpeg",
        jellyfinPath:
            `linux/${FFMPEG_JELLYFIN_SERIES}/${FFMPEG_JELLYFIN_BUILD}/arm64/` +
            `jellyfin-ffmpeg_${FFMPEG_JELLYFIN_BUILD}_portable_linuxarm64-gpl.tar.xz`,
        npmPath: `ffmpeg-${FFMPEG_VERSION}-linux-arm64-gpl.tar.xz`,
    },
};

export function resolveFfmpegAsset(
    platform: NodeJS.Platform,
    arch: NodeJS.Architecture,
): FfmpegAsset | undefined {
    return FFMPEG_ASSETS[`${platform}-${arch}`];
}