import type { IPlatformContext } from "$lib/types/plugin/platform";
import activities from './leftbar'

export class PluginMainService {
    // 自动注入全局平台共享服务
    constructor(
        private readonly ctx: IPlatformContext,
    ) { }

    // 插件启动
    async initialize() {
        const log = this.ctx.log;
        for (const activity of activities) {
            this.ctx.extActivity.register(activity)
        }
        log.info('插件初始化完成');
    }

    // 插件销毁、资源清理
    async dispose() {
        const log = this.ctx.log;
        for (const activity of activities) {
            this.ctx.extActivity.unregister(activity.id)
        }        
        log.info('插件资源已释放');
    }
}