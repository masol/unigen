import {
    type AwilixContainer,
} from 'awilix'
/**
 * 每个插件包必须实现的生命周期契约
 *由插件入口模块 default export 或命名 export 提供
 */
export interface PluginModule {
    /** 向DI 容器注册自身提供的服务（收到的是隔离的 scoped container） */
    register(container: AwilixContainer): void | Promise<void>

    /**
     * 注册完成后调用 —— 此时容器内所有依赖均可resolve
     * 适合做跨插件连接、启动后台任务等
     */
    activate?(container: AwilixContainer): void | Promise<void>

    /**卸载前调用 —— 释放资源、取消订阅等 */
    deactivate?(): void | Promise<void>
}
