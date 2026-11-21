// 低频变化、无需频繁修改的持久化配置池。
// 与 secondConfig 分离：secondConfig 只负责最近项目等高频 UI 状态；
// 本 store 负责 IP 区域缓存、检索初始化标记、代码运行时配置等慢变化数据。

import { StableConfig } from '$types/appconfig.js';
import Store from 'electron-store';
import { stableSchema } from './stable.schema.js';

class StableConfigService {
    private store: Store<StableConfig>;

    constructor(store: Store<StableConfig>) {
        this.store = store;

        // 与 secondConfig 保持一致的防御：磁盘文件损坏时重置为 schema 默认值。
        try {
            if (!this.store.store || typeof this.store.store !== 'object') {
                this.store.clear();
            }
        } catch {
            this.store.clear();
        }
    }

    /**
     * 获取整个配置对象。
     * 内部会自动融合 schema 中定义的所有最新默认值。
     */
    getAll(): Readonly<StableConfig> {
        return this.store.store;
    }

    /**
     * 通用获取配置项方法。
     */
    get<K extends keyof StableConfig>(key: K): Readonly<StableConfig[K]> {
        return this.store.get(key);
    }

    /**
     * 通用设置配置项方法。
     * 不进行内部异常捕获，若 schema 校验失败，异常将直接向上抛出由外部处理。
     */
    set<K extends keyof StableConfig>(
        key: K,
        value: Exclude<StableConfig[K], undefined>,
    ): void {
        this.store.set(key, value);
    }
}

const KEY = Symbol.for('unigen.singleton.stableConfig');

/**
 * 获取 StableConfigService 单例实例。
 */
export const stableConfig = (): StableConfigService => {
    const g = globalThis as unknown as Record<
        symbol,
        StableConfigService | undefined
    >;
    if (!g[KEY]) {
        g[KEY] = new StableConfigService(
            new Store<StableConfig>({
                schema: stableSchema,
                // 低频读、极低频写：开启内存缓存。
                cache: true,
                name: 'stable',
            }),
        );
    }
    return g[KEY]!;
};