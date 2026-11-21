// packages/main/src/libs/coderuntime/registry.ts
//
// 集中管理所有「运行时下载 / 镜像 / 版本」元数据。
//
// 设计目标：
//   - 一处修改，全局生效；
//   - 版本号 / URL / 镜像随软件版本更新，无需改代码逻辑；
//   - 消费者只通过 `pickMirror` / `RUNTIME_REGISTRY` 访问，避免散落各处；
//   - 纯数据，无副作用，可被 UI 直接 import 展示（如显示内置版本号）。
//
// ⚠️ 注意：
//   - `china` 字段是中国区镜像的默认值；失效时优先更新此处。
//   - `ipInfo.inChina === false` 时一律走 `official`；
//     为 true 且 `china` 非空则强制走 `china`，**不回退** official
//     （用户已明确要求"国内必须启用镜像，不能使用原始地址"）。
//   - 如需临时禁用某个引擎的中国镜像，把该字段置空即可。

export interface MirrorUrlPair {
    /** 官方默认值 */
    official: string;
    /** 中国区镜像；空字符串表示无镜像，回落 official */
    china: string;
}

export interface UvAsset {
    /** uv GitHub Release 的 target triple */
    target: string;
    /** 归档格式 */
    archive: "zip" | "tar.gz";
}

export interface UvRegistry {
    version: string;
    /** Release 下载基础 URL；拼接 `/{version}/{filename}` */
    releaseBase: MirrorUrlPair;
    /** 平台-架构 → 资产描述 */
    assets: Record<string, UvAsset>;
}

export interface NodeRegistry {
    version: string;
    /** 下载基础 URL；拼接 `/v{version}/{filename}` */
    distBase: MirrorUrlPair;
}

export interface PythonRegistry {
    /** uv 托管的默认 Python 版本（可被用户配置覆盖） */
    defaultVersion: string;
    /** PyPI 简单索引 */
    index: MirrorUrlPair;
}

export interface NpmRegistry {
    registry: MirrorUrlPair;
}

export interface RuntimeRegistry {
    uv: UvRegistry;
    nodejs: NodeRegistry;
    python: PythonRegistry;
    npm: NpmRegistry;
}

/**
 * 集中注册表。所有地址 / 版本 / 镜像在此维护。
 */
export const RUNTIME_REGISTRY: RuntimeRegistry = {
    uv: {
        version: "0.4.30",
        releaseBase: {
            official: "https://github.com/astral-sh/uv/releases/download",
            // ghproxy 是国内较稳定的 GitHub 加速代理。
            // 如失效，可替换为以下之一（在 china 字段中选一个）：
            //   https://gh-proxy.com/https://github.com/astral-sh/uv/releases/download
            //   https://ghfast.top/https://github.com/astral-sh/uv/releases/download
            //   https://mirror.ghproxy.com/https://github.com/astral-sh/uv/releases/download
            china: "https://ghproxy.net/https://github.com/astral-sh/uv/releases/download",
        },
        assets: {
            "win32-x64": { target: "x86_64-pc-windows-msvc", archive: "zip" },
            "win32-arm64": { target: "aarch64-pc-windows-msvc", archive: "zip" },
            "darwin-x64": { target: "x86_64-apple-darwin", archive: "tar.gz" },
            "darwin-arm64": { target: "aarch64-apple-darwin", archive: "tar.gz" },
            "linux-x64": { target: "x86_64-unknown-linux-gnu", archive: "tar.gz" },
            "linux-arm64": { target: "aarch64-unknown-linux-gnu", archive: "tar.gz" },
        },
    },
    nodejs: {
        version: "20.17.0",
        distBase: {
            official: "https://nodejs.org/dist",
            china: "https://npmmirror.com/mirrors/node",
        },
    },
    python: {
        defaultVersion: "3.12",
        index: {
            official: "https://pypi.org/simple",
            china: "https://pypi.tuna.tsinghua.edu.cn/simple",
        },
    },
    npm: {
        registry: {
            official: "https://registry.npmjs.org",
            china: "https://registry.npmmirror.com",
        },
    },
};

/** `platform-arch` 键（用于 `RUNTIME_REGISTRY.uv.assets` 的 lookup）。 */
export function platformKey(
    platform: NodeJS.Platform,
    arch: NodeJS.Architecture,
): string {
    return `${platform}-${arch}`;
}

/**
 * 从 `MirrorUrlPair` 选择当前应使用的 URL。
 *
 * - `inChina = true` 且 `china` 非空 → 强制走 china；
 * - 其他情况走 official。
 */
export function pickMirror(pair: MirrorUrlPair, inChina: boolean): string {
    if (inChina && pair.china) return pair.china;
    return pair.official;
}