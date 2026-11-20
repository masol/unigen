export type EnvironmentTransport = 'local' | 'ssh';

export type EnvironmentStatus =
    | 'unknown'
    | 'checking'
    | 'online'
    | 'offline'
    | 'error';

export interface SshTarget {
    host: string;
    port?: number;
    user: string;
}

export type EnvironmentComponentStatus =
    | 'ready'
    | 'missing'
    | 'update-available';

export interface EnvironmentComponent {
    id: string;
    name: string;
    version?: string;
    status: EnvironmentComponentStatus;
}

/**
 * 自有环境系统的摘要（列表页展示）。
 * 类似 ollama 的"本地模型"管理页 —— 用户不能在 UI 中新建环境类型，
 * 环境清单由服务器按版本固定提供。
 */
export interface EnvironmentSummary {
    id: string;
    /** 环境类型 id（如 llamacpp），用于选择详情页的配置组件 */
    kind: string;
    name: string;
    description: string;
    transport: EnvironmentTransport;
    ssh?: SshTarget;
    status: EnvironmentStatus;
    /** 修改后自动应用并重启服务 */
    autoSync: boolean;
    error?: string;
}

/**
 * 详情页展示的完整数据。
 * `config` 是环境类型特有的配置对象，由对应 `LlamaCppConfig` 等组件自己解释。
 */
export interface EnvironmentDetail extends EnvironmentSummary {
    components: EnvironmentComponent[];
    config: Record<string, unknown>;
}