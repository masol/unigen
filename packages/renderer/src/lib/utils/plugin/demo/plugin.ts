// 插件入口 index.ts
import { asClass, type AwilixContainer } from 'awilix';
import type { PluginModule } from '$lib/types/plugin';
import { PluginMainService } from './mainservice';

// 缓存实例，用于卸载清理
let mainService: PluginMainService | null = null;

const plugin: PluginModule = {
    register(scope: AwilixContainer) {
        // 1. 注册内部主服务
        scope.register({
            main: asClass(PluginMainService).singleton()
        });
    },

    async activate(scope: AwilixContainer) {
        // 2. 启动插件
        mainService = scope.resolve('main');
        await mainService?.initialize();
    },

    async deactivate() {
        // 3. 销毁资源
        if (mainService) {
            await mainService.dispose();
            mainService = null;
        }
    }
};

export default plugin;



/*
plugins/your-plugin-id/
├─ index.ts          # 插件入口（唯一导出 PluginModule）
├─ plugin.api.ts     # 【重要】插件对外公开类型/接口（外部调用方依赖）
├─ services/
│  └─ main.service.ts # 插件主服务（核心逻辑、对外方法、资源管理）
└─ types.ts          # 插件内部私有类型（不对外暴露）
*/