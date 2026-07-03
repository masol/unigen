import type { IPlatformContext } from "$lib/types/plugin/platform";
import activities from './leftbar';
import { inputStore } from "./leftbar/input-manager";
import { specStore } from "./leftbar/spec-setting/spec.svelte";

export class PluginMainService {
    #unhook: (() => void) | null = null;
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
        this.#unhook = this.ctx.hook.hook("project:loaded", async (payload) => {
            // TS 自动推导出 payload 的类型为 { path: string }
            await specStore.init();
            await inputStore.init();
            this.ctx.log.debug('插件处理项目已加载调用，路径为:', payload.path);
        });
        log.info('[PluginMainService] 插件初始化完成');
    }

    // 插件销毁、资源清理
    async dispose() {
        if (this.#unhook) {
            this.#unhook();
            this.#unhook = null;
        }
        const log = this.ctx.log;
        for (const activity of activities) {
            this.ctx.extActivity.unregister(activity.id)
        }
        log.info('[PluginMainService] 插件资源已释放');
    }
}