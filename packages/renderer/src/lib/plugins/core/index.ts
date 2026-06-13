import { asClass, type AwilixContainer } from 'awilix';
import type { PluginModule } from '$lib/types/plugin';
import { PluginMainService } from './srvs/core';

const plugin: PluginModule = {
    register(scope: AwilixContainer) {
        // 1. 注册内部主服务
        scope.register({
            main: asClass(PluginMainService).scoped()
        });
    },

    async activate(scope: AwilixContainer) {
        // 2. 启动插件
        const mainService = scope.resolve('main') as PluginMainService;
        await mainService?.initialize();
    },

    async deactivate() {
        // 3. 销毁资源
        // if (mainService) {
        //     await mainService.dispose();
        //     mainService = null;
        // }
    }
};

export default plugin