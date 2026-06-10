// electron/store/configStore.ts
import Store from 'electron-store';
import { AppConfig } from '$types/appconfig.js';
import { configSchema } from './schema.js';

// 深度合并：保留 target 中的有效值，缺失/错误字段用 defaultVal
function deepMerge<T>(target: Partial<T>, defaultVal: T): T {
    const result: any = { ...defaultVal };

    for (const key in target) {
        const tVal = target[key];
        if (tVal === undefined || tVal === null) {
            continue;
        }

        const dVal = result[key];
        if (
            typeof tVal === 'object' &&
            typeof dVal === 'object' &&
            !Array.isArray(tVal) &&
            tVal !== null &&
            dVal !== null
        ) {
            result[key] = deepMerge(tVal as any, dVal as any);
        } else {
            result[key] = tVal;
        }
    }

    return result as T;
}

// 安全获取配置字段，解析错误时使用默认值
function safeGet<T>(store: Store<AppConfig>, key: string, defaultValue: T): T {
    try {
        const value = store.get(key);
        if (value === undefined || value === null) {
            return defaultValue;
        }
        return value as T;
    } catch (err) {
        // 解析错误 / 类型错误等，直接返回默认值
        console.warn(`Failed to parse config key "${key}", using default value`, err);
        return defaultValue;
    }
}

// 安全设置配置字段
function safeSet<T>(store: Store<AppConfig>, key: string, value: T): void {
    try {
        store.set(key, value);
    } catch (err) {
        console.warn(`Failed to set config key "${key}"`, err);
    }
}

export class ConfigService {
    private store: Store<AppConfig>;

    constructor(store: Store<AppConfig>) {
        this.store = store;

        // 初始化时修复配置：解析错误 / 字段缺失时直接使用默认值
        this.migrateToDefaults();
    }

    /**
     * 检查并修复整个配置：
     * - 配置文件为空 / 不是对象 -> 直接用默认配置
     * - 某个字段解析错误 / 类型错误 -> 该字段用默认值
     * - 其他有效字段保留
     */
    private migrateToDefaults(): void {
        try {
            const raw = this.store.store;

            const defaults = this.getDefaultConfig();

            // 配置为空或不是对象，直接用默认配置
            if (!raw || typeof raw !== 'object') {
                this.store.store = defaults;
                console.info('Config is empty or invalid, using default config');
                return;
            }

            // 深度合并：保留有效值，错误/缺失字段用默认值
            const merged = deepMerge(raw, defaults);
            this.store.store = merged;
            console.info('Config migrated to defaults for invalid fields');
        } catch (err) {
            // 整体解析失败，直接用默认配置
            console.warn('Failed to parse config file, using default config', err);
            this.store.store = this.getDefaultConfig();
        }
    }

    /**
     * 获取完整默认配置
     */
    private getDefaultConfig(): AppConfig {
        return {
            windowState: {
                width: 1280,
                height: 720,
                isMaximized: false
            },
            theme: 'system',
            lang: 'zh-CN',
        };
    }

    /**
     * 获取整个配置
     * 如果解析失败，返回完整默认配置
     */
    getAll(): AppConfig {
        try {
            const raw = this.store.store;
            if (!raw || typeof raw !== 'object') {
                return this.getDefaultConfig();
            }
            return deepMerge(raw, this.getDefaultConfig());
        } catch (err) {
            console.warn('Failed to parse full config, using default', err);
            return this.getDefaultConfig();
        }
    }

    setAll(config: AppConfig): void {
        try {
            this.store.store = config;
        } catch (err) {
            console.warn('Failed to set full config', err);
        }
    }

    // ---------------------- windowState ----------------------

    getWindowState(): AppConfig['windowState'] {
        const defaults = this.getDefaultConfig().windowState;
        return safeGet(this.store, 'windowState', defaults);
    }

    setWindowState(state: AppConfig['windowState']): void {
        safeSet(this.store, 'windowState', state);
    }

    // ---------------------- theme ----------------------

    getTheme(): AppConfig['theme'] {
        return safeGet(this.store, 'theme', 'light');
    }

    setTheme(theme: AppConfig['theme']): void {
        safeSet(this.store, 'theme', theme);
    }

    // ---------------------- lang ----------------------

    getLang(): AppConfig['lang'] {
        return safeGet(this.store, 'lang', 'zh-CN');
    }

    setLang(lang: AppConfig['lang']): void {
        safeSet(this.store, 'lang', lang);
    }

    // 以后加新字段，按同样方式：
    // getX() { return safeGet(this.store, 'x', defaultX); }
    // setX(v) { safeSet(this.store, 'x', v); }
}

// 单例
export const configService = new ConfigService(
    new Store<AppConfig>({
        schema: configSchema,
        name: 'config',
    })
);