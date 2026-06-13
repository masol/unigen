import type { IPlatformContext } from "$lib/types/plugin/platform";

export class PluginMainService {
    // 自动注入全局平台共享服务
    constructor(
        private readonly ctx: IPlatformContext,
    ) { }

    // 插件启动
    async initialize() {
        const log = this.ctx.log;
        // console.log("ctx=", this.ctx)
        // console.log("log=", log)
        log.info('插件初始化完成');
    }

    // 插件销毁、资源清理
    async dispose() {
        const log = this.ctx.log;
        log.info('插件资源已释放');
    }

    // === 对外暴露的 API（外部 resolve 后调用） ===
    doBiz() {
        // 业务方法
    }
}