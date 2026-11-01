// electron/store/configStore.ts
import { getCurrentProject } from '$libs/utils/api/index.js';
import { broadcast } from '$libs/utils/rpcevt.js';
import type { ITelemetryService } from '$libs/utils/telemetry/telemetry.interface.js';
import { AppConfig } from '$types/appconfig.js';
import { app } from 'electron';
import Store from 'electron-store';
import { join } from 'path';
import { configSchema } from './schema.js';

/**
 * 动态默认值：依赖运行时环境（如 userData 路径），
 * 在 ConfigService 构造时计算一次并落盘，之后读取直接使用。
 */
function buildDynamicDefaults(): Partial<AppConfig> {
    return {
        task_dir: join(app.getPath('userData'), 'user_tasks'),
    } as Partial<AppConfig>;
}

/** 判断一个值是否为空（undefined / null / 空白字符串） */
function isEmptyValue(v: unknown): boolean {
    return (
        v === undefined ||
        v === null ||
        (typeof v === 'string' && v.trim() === '')
    );
}

class ConfigService {
    private store: Store<AppConfig>;

    // 只为ITelemetryService服务，用于解耦循环依赖。
    oTel: ITelemetryService | null = null;

    constructor(store: Store<AppConfig>) {
        this.store = store;

        // 确保如果磁盘上的物理文件遭遇人为损坏（如变成了空文件或非法 JSON），
        // 也能在初始化时立即根据 configSchema 重置并生成一个干净、合规的默认 JSON 配置文件。
        try {
            if (!this.store.store || typeof this.store.store !== 'object') {
                this.store.clear();
            }
        } catch {
            this.store.clear();
        }

        // 初始化后检查一次动态默认值：为空则补上并落盘。
        // 之后读取时 store 中自然已有值，读路径无需再拦截。
        this.ensureDynamicDefaults();
    }

    /**
     * 将当前计算出的动态默认值写入 store（仅当 store 中该值为空时）。
     */
    private ensureDynamicDefaults(): void {
        const dynamic = buildDynamicDefaults();
        for (const [key, value] of Object.entries(dynamic)) {
            if (value === undefined) continue;
            const current = this.store.get(key as keyof AppConfig);
            if (isEmptyValue(current)) {
                this.store.set(key as keyof AppConfig, value as AppConfig[keyof AppConfig]);
            }
        }
    }

    /**
     * 获取整个配置对象
     * 内部会自动融合 schema 中定义的所有最新默认值
     */
    getAll(): AppConfig {
        return this.store.store;
    }

    /**
     * 覆盖重写整个配置
     * 如果配置不符合 schema 规范，会直接向外抛出异常
     */
    setAll(config: AppConfig): void {
        this.store.store = config;
        const prj = getCurrentProject();
        broadcast({
            name: 'cfg:setall',
            srcId: prj?.wid || -1,
            payload: config,
        });
    }

    /**
     * 通用获取配置项方法
     * 传入的 key 必须是 AppConfig 的键，返回值会自动推导为该键对应的类型
     */
    get<K extends keyof AppConfig>(key: K): AppConfig[K] {
        return this.store.get(key);
    }

    /**
     * 通用设置配置项方法
     * 传入的 key 必须是 AppConfig 的键，value 的类型会被严格约束为该键对应的类型
     * 不进行内部异常捕获，若 schema 校验失败，异常将直接向上抛出由外部处理
     */
    set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
        this.store.set(key, value);
        if (this.oTel && key === 'telemetry') {
            this.oTel.reconfigure(value as string);
        }
        const prj = getCurrentProject();
        broadcast({
            name: 'cfg:set',
            srcId: prj?.wid || -1,
            payload: {
                name: key,
                value,
            },
        });
    }
}

const KEY = Symbol.for('unigen.singleton.configService');
/**
 * 获取 ConfigService 单例实例
 */
export const configService = (): ConfigService => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any;
    if (!g[KEY]) {
        const dynamicDefaults = buildDynamicDefaults();
        g[KEY] = new ConfigService(
            new Store<AppConfig>({
                schema: configSchema,
                name: 'config',
                defaults: dynamicDefaults as AppConfig,
            }),
        );
    }
    return g[KEY] as ConfigService;
};