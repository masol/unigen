// @ts-expect-error services/PluginMainService.ts
import type { Logger, AppConfig } from '';

export class PluginMainService {
    // 自动注入全局平台共享服务
    constructor(
        private readonly logger: Logger,
        private readonly appConfig: AppConfig
    ) { }

    // 插件启动
    async initialize() {
        this.logger.info('插件初始化完成');
    }

    // 插件销毁、资源清理
    async dispose() {
        this.logger.info('插件资源已释放');
    }

    // === 对外暴露的 API（外部 resolve 后调用） ===
    doBiz() {
        // 业务方法
    }
}