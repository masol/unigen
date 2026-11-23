// packages/main/src/libs/loader/user-agent.ts
//
// URL → User-Agent 策略。
//
// 背景：
//   - GitHub 官方 / 部分 GitHub 代理节点会把默认 UA 当爬虫，返回
//     HTTP 200 + HTML 拦截页；这类 URL 需要浏览器 UA；
//   - 普通镜像（例如 TUNA / USTC / npm registry）反而可能对浏览器 UA
//     启用防盗链并返回 403。因此 **不能** 把浏览器 UA 无差别应用到
//     所有下载源。
//
// 本文件集中收口该策略，probe / downloader 共用，避免两处漂移。

import { GITHUB_BROWSER_UA, GITHUB_PROXIES } from "./github-proxies.js";

function normalizeHostname(hostname: string): string {
    return hostname.toLowerCase().replace(/\.$/, "");
}

function isGithubHost(hostname: string): boolean {
    const host = normalizeHostname(hostname);
    return (
        host === "github.com" ||
        host.endsWith(".github.com") ||
        host === "githubusercontent.com" ||
        host.endsWith(".githubusercontent.com") ||
        host === "githubassets.com" ||
        host.endsWith(".githubassets.com")
    );
}

function isGithubProxyHost(parsed: URL): boolean {
    const host = normalizeHostname(parsed.hostname);
    for (const proxy of GITHUB_PROXIES) {
        if (proxy.enabled === false) continue;
        try {
            const base = new URL(proxy.baseUrl);
            if (normalizeHostname(base.hostname) !== host) continue;

            if (proxy.mode === "replace-origin") return true;

            const basePath = base.pathname.replace(/\/+$/, "");
            if (
                !basePath ||
                parsed.pathname === basePath ||
                parsed.pathname.startsWith(`${basePath}/`)
            ) {
                return true;
            }
        } catch {
            // 配置里可能有故意保留的占位域名；无效 URL 直接跳过。
        }
    }
    return false;
}

/** 该 URL 是否属于 GitHub 官方 / GitHub 代理（需要浏览器 UA）。 */
export function isGithubBrowserUaUrl(rawUrl: string): boolean {
    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return false;
    }

    if (isGithubHost(parsed.hostname)) return true;
    return isGithubProxyHost(parsed);
}

/**
 * 是否对本 URL 使用 GitHub 浏览器 UA。
 *
 * `forceGithub` 用于 downloader 已经明确知道整组源为 GitHub（例如
 * `opts.isGithub === true`）的场景；此时即使 URL 是未收录的自定义
 * 代理，也按 GitHub 语义处理。
 */
export function shouldUseGithubBrowserUa(
    rawUrl: string,
    forceGithub = false,
): boolean {
    if (forceGithub) return true;
    return isGithubBrowserUaUrl(rawUrl);
}

/** 构造仅包含 UA 的请求头；非 GitHub 源返回空对象（交给后端默认 UA）。 */
export function buildUserAgentHeaders(
    rawUrl: string,
    forceGithub = false,
): Record<string, string> {
    return shouldUseGithubBrowserUa(rawUrl, forceGithub)
        ? { "User-Agent": GITHUB_BROWSER_UA }
        : {};
}