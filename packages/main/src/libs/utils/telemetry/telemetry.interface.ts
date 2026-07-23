/**
 * 遥测服务的对外契约。
 * 外部应用只依赖此接口，不关心底层 OTel 实现。
 */
export interface ITelemetryService {
    /**
     * 系统初始化时调用一次。
     * 读取当前配置端点并启动全局 OTel 管道。
     * @param endpoint 上报端点 URL，空/undefined 表示不上报（走 Noop）
     */
    initialize(endpoint?: string): Promise<void>;

    /**
     * 配置变更时调用。
     * 动态切换到新地址，无需重启进程，不中断全局管道。
     * @param endpoint 新的上报端点 URL，空/undefined 表示切换到不上报
     */
    reconfigure(endpoint?: string): void;

    /**
     * 应用退出时优雅关闭，flush 剩余数据。
     */
    shutdown(): Promise<void>;

    /**
     * 当前是否处于激活（有有效端点）状态。
     */
    isEnabled(): boolean;
}

/**
 * 动态配置的可变载体。
 * DynamicProxyExporter 每次 export 前会读取此对象的最新值。
 */
export interface ITelemetryDynamicConfig {
    /** 当前上报端点，null 表示不上报 */
    endpoint: string | null;
    /** 可选透传的自定义 Headers（如鉴权 token） */
    headers?: Record<string, string>;
}

/**
 * 抽象基类：提供配置状态的通用维护逻辑。
 * 具体的 OTel 生命周期由子类实现。
 */
export abstract class BaseTelemetryService implements ITelemetryService {
    /** 共享的可变配置对象，传给 Exporter 做热读取 */
    protected readonly dynamicConfig: ITelemetryDynamicConfig = {
        endpoint: null,
        headers: undefined,
    };

    abstract initialize(endpoint?: string): Promise<void>;
    abstract reconfigure(endpoint?: string): void;
    abstract shutdown(): Promise<void>;

    isEnabled(): boolean {
        return !!this.dynamicConfig.endpoint;
    }

    /**
     * 规范化端点：空字符串/空白/undefined 统一转为 null。
     */
    protected normalizeEndpoint(endpoint?: string): string | null {
        if (!endpoint) return null;
        const trimmed = endpoint.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
}