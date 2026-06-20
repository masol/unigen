import { asFunction, type AwilixContainer } from 'awilix';
import type { PluginModule } from '$lib/types/plugin/plugin';
import { PluginMainService } from './mainsrv/srv';

const plugin: PluginModule = {
    register(scope: AwilixContainer) {
        // 1. 注册内部主服务
        // 在 PROXY 模式下，使用 asFunction 显式注入依赖
        scope.register({
            main: asFunction(
                ({ ctx }) => new PluginMainService(ctx)
            ).scoped()
        });
    },

    async activate(scope: AwilixContainer) {
        // 2. 启动插件
        const mainService = scope.resolve<PluginMainService>('main');
        await mainService?.initialize();
    },

    async deactivate(scope: AwilixContainer) {
        // 3. 销毁资源
        const mainService = scope.resolve<PluginMainService>('main');
        await mainService?.dispose();
    }
};

export default plugin