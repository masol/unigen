// packages/main/src/libs/loader/github-proxies.ts
//
// GitHub 下载加速配置。
//
// 说明：
// - 本文件是**纯配置**，未来新增/下线只改这里；
// - `mode` 有两种：
//     · `prefix`          —— 前缀 + 原始完整 GitHub URL；
//     · `replace-origin`  —— 用 `baseUrl` 替换 `https://github.com`，保留后面路径；
// - `enabled: false` 的条目不会被自动使用，但保留在配置中方便随时启用；
// - 顺序即默认尝试顺序（ipull 后端）；aria2 后端会把这些 URL 作为同一文件的
//   多源并行下载，不受顺序影响。
//
// 注意：本文件只包含“前缀式/换源式”的 Release 资产；
//       gitclone.com 等仅 clone 用的以 enabled:false 保留，不参与下载。

export interface GithubProxy {
    /** 名称（用于日志 / onSourceChange label） */
    name: string;
    /** 基地址；不要带尾部斜杠，`prefix` 模式会在拼接时补一个 `/` */
    baseUrl: string;
    /** 拼接方式 */
    mode: "prefix" | "replace-origin";
    /** false 则跳过该节点 */
    enabled?: boolean;
    /** 备注 */
    note?: string;
}

/** 访问 GitHub 时使用的浏览器 UA（部分节点会把默认 UA 当爬虫并返回 HTML 拦截页）。 */
export const GITHUB_BROWSER_UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const GITHUB_PROXIES: readonly GithubProxy[] = [
    {
        name: "gh-proxy.com",
        baseUrl: "https://gh-proxy.com",
        mode: "prefix",
        note: "2026-11-23 实测最快",
    },
    { name: "ghproxy.net", baseUrl: "https://ghproxy.net", mode: "prefix" },
    { name: "ghfast.top", baseUrl: "https://ghfast.top", mode: "prefix" },
    { name: "githubproxy.cc", baseUrl: "https://githubproxy.cc", mode: "prefix" },
    { name: "gh-proxy.org", baseUrl: "https://gh-proxy.org", mode: "prefix" },
    {
        name: "xget.xi-xu.me",
        baseUrl: "https://xget.xi-xu.me/gh",
        mode: "replace-origin",
    },
    { name: "gh.llkk.cc", baseUrl: "https://gh.llkk.cc", mode: "prefix" },
    {
        name: "hub.gitmirror.com",
        baseUrl: "https://hub.gitmirror.com",
        mode: "prefix",
    },
    { name: "gitproxy.click", baseUrl: "https://gitproxy.click", mode: "prefix" },
    {
        name: "github.moeyy.xyz",
        baseUrl: "https://github.moeyy.xyz",
        mode: "prefix",
    },
    {
        name: "shturl.",
        baseUrl: "https://shturl.",
        mode: "prefix",
        note: "域名末尾带点（FQDN），部分网络不可用",
    },
    { name: "gh-proxy.net", baseUrl: "https://gh-proxy.net", mode: "prefix" },
    { name: "ghproxy.link", baseUrl: "https://ghproxy.link", mode: "prefix" },
    { name: "ghproxy.cc", baseUrl: "https://ghproxy.cc", mode: "prefix" },
    {
        name: "kkgithub.com",
        baseUrl: "https://kkgithub.com",
        mode: "replace-origin",
        note: "仓库未被镜像收录时 404",
    },
    {
        name: "bgithub.xyz",
        baseUrl: "https://bgithub.xyz",
        mode: "replace-origin",
        note: "仓库未被镜像收录时 404",
    },
    {
        name: "gitclone.com",
        baseUrl: "https://gitclone.com/github.com",
        mode: "replace-origin",
        enabled: false,
        note: "仅适合 git clone，不用于 Release 资产下载；默认禁用",
    },
];