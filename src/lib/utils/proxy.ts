import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import picomatch from 'picomatch';

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
    // 缓存编译后的 matcher 函数
    matchers?: ((hostname: string) => boolean)[];
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
 * 检查主机名是否匹配代理规则（使用缓存的 matcher）
 */
const shouldProxy = (hostname: string): ProxyConfig | null => {
    for (const proxyInfo of proxyInfos) {
        if (!proxyInfo.matchers || proxyInfo.matchers.length === 0) {
            continue;
        }

        // 只要有一个 matcher 匹配即命中
        if (proxyInfo.matchers.some(matcher => matcher(hostname))) {
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
    };

    if (proxyConfig.basicAuth?.username) {
        allProxy.auth = {
            username: proxyConfig.basicAuth.username,
            password: proxyConfig.basicAuth.password || ''
        };
    }

    if (proxyConfig.connectTimeout) {
        allProxy.connectTimeout = proxyConfig.connectTimeout;
    }

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

    if (init) {
        Object.assign(options, init);
    }

    return options;
};

const proxyFetch = async (
    input: string | URL | Request,
    init?: RequestInit,
): Promise<Response> => {
    // console.log('Intercepted fetch request:', input, init);

    if (!origFetch) {
        throw new Error('Original fetch not initialized');
    }

    const hostname = extractHostname(input);
    if (!hostname) {
        return origFetch(input, init);
    }

    const proxyConfig = shouldProxy(hostname);
    if (proxyConfig) {
        // console.log(`Hostname "${hostname}" matches proxy pattern, using proxy:`, proxyConfig.url);
        try {
            const proxyOptions = buildProxyOptions(proxyConfig, init);
            return await tauriFetch(input, proxyOptions);
        } catch (error) {
            console.error('Proxy fetch failed, falling back to original fetch:', error);
            return origFetch(input, init);
        }
    } else {
        // console.log(`Hostname "${hostname}" does not match any proxy pattern`);
        return origFetch(input, init);
    }
};

export class Proxy {
    async init(): Promise<boolean> {
        origFetch = window.fetch;
        window.fetch = proxyFetch;
        console.log('Fetch proxy initialized');
        return true;
    }

    setProxies(configs: ProxyConfig[]) {
        proxyInfos = configs
            .filter(c => c.enabled && c.target)
            .map(c => {
                const targets = c.target!
                    .split(";")
                    .map(t => t.trim())
                    .filter(t => t.length > 0);

                // ✅ 预编译所有 glob 模式为 matcher 函数，并缓存
                const matchers = targets.map(pattern => {
                    // 转为小写以支持大小写不敏感匹配（host 是 case-insensitive）
                    const lowerPattern = pattern.toLowerCase();
                    const matcher = picomatch(lowerPattern);
                    return (hostname: string) => matcher(hostname.toLowerCase());
                });

                return {
                    ...c,
                    targets,
                    matchers
                };
            });

        console.log('Proxy configurations updated:', proxyInfos);
    }

    getProxies(): ProxyConfig[] {
        return [...proxyInfos];
    }

    restore(): void {
        if (origFetch) {
            window.fetch = origFetch;
            console.log('Fetch proxy restored');
        }
    }
}

export const proxy = new Proxy();