// packages/main/src/libs/coderuntime/engines/python.reg.ts
//
// Python 运行时（uv）注册表：
//   - uv 二进制版本与镜像；
//   - uv 资产 target triple（与 GitHub Release 命名一致）；
//   - 默认 Python 版本（uv 托管）；
//   - python-build-standalone 镜像（供 `uv python install`）；
//   - PyPI 索引。
//
// 关于中国区镜像的选择逻辑：
//   - NJU / LZU 保存历史版本 → 优先（下载 uv 二进制 / 解释器都稳定）；
//   - USTC 不保存历史版本 → 放最后（版本一旦轮替会 404）。

/** uv 二进制版本。 */
export const UV_VERSION = "0.13.9";

/**
 * uv 二进制下载 base；拼接 `/<version>/uv-<target>.<archive>`。
 *
 * 官方 GitHub Release 的路径形如：
 *   https://github.com/astral-sh/uv/releases/download/<version>/<filename>
 *
 * 镜像兼容同样的 `/<version>/<filename>` 结构。
 */
export const UV_BINARY_BASE = {
    official: "https://github.com/astral-sh/uv/releases/download",
    china: [
        "https://mirrors.ustc.edu.cn/github-release/astral-sh/uv",
    ],
} as const;

export interface UvAsset {
    target: string;
    archive: "zip" | "tar.gz";
}

/** 平台-架构 → uv 资产描述。 */
export const UV_ASSETS: Record<string, UvAsset> = {
    "win32-x64": { target: "x86_64-pc-windows-msvc", archive: "zip" },
    "win32-arm64": { target: "aarch64-pc-windows-msvc", archive: "zip" },
    "darwin-x64": { target: "x86_64-apple-darwin", archive: "tar.gz" },
    "darwin-arm64": { target: "aarch64-apple-darwin", archive: "tar.gz" },
    "linux-x64": { target: "x86_64-unknown-linux-gnu", archive: "tar.gz" },
    "linux-arm64": { target: "aarch64-unknown-linux-gnu", archive: "tar.gz" },
};

/** uv 托管的默认 Python 版本。 */
export const PYTHON_DEFAULT_VERSION = "3.15.2";

/**
 * python-build-standalone 的镜像（供 `UV_PYTHON_INSTALL_MIRROR`）。
 *
 * `uv python install` 会向该前缀请求 `YYYYMMDD/*.tar.zst` 资产；
 * 只在中国区启用，官方默认走 GitHub。
 */
export const PYTHON_BUILD_STANDALONE_MIRROR = {
    china: [
        "https://mirror.nju.edu.cn/github-release/astral-sh/python-build-standalone",
        "https://mirror.lzu.edu.cn/github-release/astral-sh/python-build-standalone",
        "https://mirrors.ustc.edu.cn/github-release/astral-sh/python-build-standalone",
    ],
} as const;

/**
 * PyPI 索引（`uv pip install` / `uv add`）。
 *
 * 中国区**仅**在这些镜像之间选择第一个可用地址；不做测速（PyPI
 * 镜像的 RTT 稳定性远超选源收益，且首地址通常已足够）。
 */
export const PYPI_INDEX = {
    official: "https://pypi.org/simple",
    china: [
        "https://pypi.tuna.tsinghua.edu.cn/simple",
        "https://mirrors.aliyun.com/pypi/simple",
        "https://mirrors.ustc.edu.cn/pypi/simple",
        "https://mirrors.hust.edu.cn/pypi/web/simple",
        "https://mirrors.nju.edu.cn/pypi/web/simple",
        "https://mirrors.bfsu.edu.cn/pypi/web/simple",
        "https://mirrors.cloud.tencent.com/pypi/simple",
        "https://repo.huaweicloud.com/repository/pypi/simple",
        "https://mirror.sjtu.edu.cn/pypi/web/simple",
    ],
} as const;