// electron/store/configStore.ts
import { mcpRoute } from '$libs/mcp/route.js';
import { bootMcpTools } from '$libs/mcp/sync.js';
import { globalToolDB } from '$libs/tooldb/globaltooldb.js';
import { getCurrentProject } from '$libs/utils/api/index.js';
import evtbus from '$libs/utils/evtbus.js';
import { broadcast } from '$libs/utils/rpcevt.js';
import type { ITelemetryService } from '$libs/utils/telemetry/telemetry.interface.js';
import { AppConfig } from '$types/appconfig.js';
import { Provider } from '$types/index.js';
import type { McpServerConfig } from '$types/shared/mcp.js';
import { app } from 'electron';
import Store from 'electron-store';
import { join } from 'path';
import { isEqual } from 'radashi';
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
    getAll(): Readonly<AppConfig> {
        return this.store.store; // structuredClone(this.store.store);
    }

    /**
     * 覆盖重写整个配置
     * 如果配置不符合 schema 规范，会直接向外抛出异常
     */
    setAll(config: AppConfig): void {
        const embedOld = this.store.store.embed_model;
        const embedChanged = (config.embed_model !== this.store.store.embed_model)
        const rerankOld = this.store.store.rerank_model;
        const rerankChanged = (config.rerank_model !== this.store.store.rerank_model)

        const mcpChanged = !isEqual(config.mcpServers, this.store.store.mcpServers)

        this.store.store = config;
        const prj = getCurrentProject();
        broadcast({
            name: 'cfg:setall',
            srcId: prj?.wid || -1,
            payload: config,
        });
        if (embedChanged) {
            evtbus.emit("embed-changed", { old: embedOld, new: config.embed_model })
        }
        if (rerankChanged) {
            evtbus.emit("rerank-changed", { old: rerankOld, new: config.rerank_model })
        }

        if (mcpChanged) {
            bootMcpTools(mcpRoute, globalToolDB, config.mcpServers)
        }

    }

    /**
     * 通用获取配置项方法
     * 传入的 key 必须是 AppConfig 的键，返回值会自动推导为该键对应的类型
     */
    get<K extends keyof AppConfig>(key: K): Readonly<AppConfig[K]> {
        return this.store.get(key);
    }

    getProvider(providerId: string): Readonly<Provider> | undefined {
        const models = this.get("models");
        if (!models) {
            return;
        }
        return models.find(m => m.id == providerId);
    }

    getMcpServer(serverId: string): Readonly<McpServerConfig> | undefined {
        const servers = this.get('mcpServers');
        if (!servers) {
            return;
        }
        return servers.find(s => s.id === serverId);
    }

    /**
     * 按 id 新增或整体替换单个 MCP server。
     * 变更通过通用的 `set('mcpServers', ...)` 走统一广播路径（cfg:set）。
     */
    setMcpServer(config: McpServerConfig): void {
        const current = this.get('mcpServers') ?? [];
        const list = [...current];
        const index = list.findIndex(s => s.id === config.id);
        if (index >= 0) {
            list[index] = config;
        } else {
            list.push(config);
        }
        this.set('mcpServers', list);
    }

    /**
     * 按 id 移除单个 MCP server。
     * 变更通过通用的 `set('mcpServers', ...)` 走统一广播路径（cfg:set）。
     * 若指定 id 不存在则为 no-op。
     */
    removeMcpServer(serverId: string): void {
        const current = this.get('mcpServers') ?? [];
        if (!current.some(s => s.id === serverId)) {
            return;
        }
        const list = current.filter(s => s.id !== serverId);
        this.set('mcpServers', list);
    }

    /**
     * 通用设置配置项方法
     * 传入的 key 必须是 AppConfig 的键，value 的类型会被严格约束为该键对应的类型
     * 不进行内部异常捕获，若 schema 校验失败，异常将直接向上抛出由外部处理
     */
    set<K extends keyof AppConfig>(
        key: K,
        value: Exclude<AppConfig[K], undefined>
    ): void {
        const embed_old = this.store.store.embed_model;
        const rerank_old = this.store.store.rerank_model;

        this.store.set(key, value);

        if (key === "embed_model") {
            // 此处 key: "embed_model"，value: Exclude<AppConfig["embed_model"], undefined>
            if (this.store.store.embed_model !== value) {
                evtbus.emit("embed-changed", { old: embed_old, new: value as string });
            }
        } else if (key === "rerank_model") {
            if (this.store.store.rerank_model !== value) {
                evtbus.emit("rerank-changed", { old: rerank_old, new: value as string });
            }
        } else if (key === "mcpServers") {
            // 此处 value 被收窄为 AppConfig["mcpServers"]
            const servers = value as AppConfig["mcpServers"];
            if (!isEqual(servers, this.store.store.mcpServers)) {
                bootMcpTools(mcpRoute, globalToolDB, servers);
            }
        }

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
                defaults: dynamicDefaults,
                // 频繁读、少数写：开启内存缓存；写操作后 electron-store 会自动丢弃缓存。
                // 注意：开启后 .store / .get() 返回的对象和数组是冻结的，只读使用。
                cache: true,
                // 与构造函数中的“损坏则重置”意图一致：构造期遇到非法 JSON / schema 校验失败时清空并重写。
                clearInvalidConfig: true,
            }),
        );
    }
    return g[KEY] as ConfigService;
};