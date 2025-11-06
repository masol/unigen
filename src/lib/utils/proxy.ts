import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import micromatch from 'micromatch';
// import { logger } from './logger';

export type ProxyType = 'all' | 'http' | 'https';

export interface BasicAuth {
    username: string;
    password?: string;
}

export interface ProxyConfig {
    id: string;
    enabled: boolean;
    url: string;
    target?: string;
    basicAuth?: BasicAuth;
    noProxy?: string;
    connectTimeout?: number;
    acceptInvalidCerts?: boolean;
    acceptInvalidHostnames?: boolean;
    targets?: string[];
}

let origFetch: (typeof window.fetch) | null = null;
let proxyInfos: ProxyConfig[] = [];

/**
 * 从请求输入中提取主机名
 */
const extractHostname = (input: string | URL | Request): string | null => {
    try {
        let url: URL;

        if (typeof input === 'string') {
            url = new URL(input);
        } else if (input instanceof URL) {
            url = input;
        } else if (input instanceof Request) {
            url = new URL(input.url);
        } else {
            console.warn('Unsupported input type for hostname extraction');
            return null;
        }

        return url.hostname;
    } catch (error) {
        console.warn('Failed to extract hostname from input:', error);
        return null;
    }
};

/**
 * 检查主机名是否匹配代理规则
 */
const shouldProxy = (hostname: string): ProxyConfig | null => {
    for (const proxyInfo of proxyInfos) {
        if (!proxyInfo.targets || proxyInfo.targets.length === 0) {
            continue;
        }

        // 使用 micromatch 进行模式匹配
        if (micromatch.isMatch(hostname, proxyInfo.targets)) {
            return proxyInfo;
        }
    }
    return null;
};

/**
 * 构建代理选项
 */
const buildProxyOptions = (proxyConfig: ProxyConfig, init?: RequestInit): any => {
    const allProxy: Record<string, any> = {
        url: proxyConfig.url,
    }

    // 添加基本认证信息
    if (proxyConfig.basicAuth) {
        allProxy.auth = {
            username: proxyConfig.basicAuth.username,
            password: proxyConfig.basicAuth.password || ''
        };
    }

    // 合并超时设置
    if (proxyConfig.connectTimeout) {
        allProxy.connectTimeout = proxyConfig.connectTimeout;
    }

    // 合并证书验证设置
    if (proxyConfig.acceptInvalidCerts !== undefined) {
        allProxy.acceptInvalidCerts = proxyConfig.acceptInvalidCerts;
    }

    if (proxyConfig.acceptInvalidHostnames !== undefined) {
        allProxy.acceptInvalidHostnames = proxyConfig.acceptInvalidHostnames;
    }

    const options: any = {
        proxy: {
            all: allProxy
        }
    };

    // 合并用户自定义的 init 选项
    if (init) {
        Object.assign(options, init);
    }

    return options;
};

const proxyFetch = async (
    input: string | URL | Request,
    init?: RequestInit,
): Promise<Response> => {
    console.log('Intercepted fetch request:', input, init);

    if (!origFetch) {
        throw new Error('Original fetch not initialized');
    }

    // 提取主机名
    const hostname = extractHostname(input);

    if (!hostname) {
        console.log('Could not extract hostname, using original fetch');
        return origFetch(input, init);
    }

    // 检查是否需要代理
    const proxyConfig = shouldProxy(hostname);

    if (proxyConfig) {
        console.log(`Hostname "${hostname}" matches proxy pattern, using proxy:`, proxyConfig.url);

        try {
            // 构建代理选项
            const proxyOptions = buildProxyOptions(proxyConfig, init);

            // 统一输入为字符串URL
            const url = typeof input === 'string'
                ? input
                : input instanceof URL
                    ? input.toString()
                    : input.url;

            // logger.debug("proxyOptions=", proxyOptions)
            // 使用 tauriFetch 通过代理发送请求
            return await tauriFetch(input, proxyOptions);
        } catch (error) {
            console.error('Proxy fetch failed, falling back to original fetch:', error);
            // 代理失败时回退到原始 fetch
            return origFetch(input, init);
        }
    } else {
        console.log(`Hostname "${hostname}" does not match any proxy pattern, using original fetch`);
        return origFetch(input, init);
    }
};

export class Proxy {
    async init(): Promise<boolean> {
        // 保存原始的 fetch
        origFetch = window.fetch;

        // 拦截 window.fetch
        window.fetch = proxyFetch;

        console.log('Fetch proxy initialized');
        return true;
    }

    setProxies(configs: ProxyConfig[]) {
        proxyInfos = configs
            .filter(c => c.enabled && c.target)
            .map(c => ({
                ...c,
                targets: c.target!.split(";").map(t => t.trim()).filter(t => t.length > 0)
            }));

        console.log('Proxy configurations updated:', proxyInfos);
    }

    // 获取当前代理配置（用于调试）
    getProxies(): ProxyConfig[] {
        return [...proxyInfos];
    }

    // 恢复原始 fetch
    restore(): void {
        if (origFetch) {
            window.fetch = origFetch;
            console.log('Fetch proxy restored');
        }
    }
}

export const proxy = new Proxy();