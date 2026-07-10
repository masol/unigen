必须使用esm.

参考renderer/plugins下的代码。



推荐结构。
plugins/your-plugin-id/
├─ index.ts          # 插件入口（唯一导出 PluginModule）
├─ plugin.api.ts     # 【重要】插件对外公开类型/接口（外部调用方依赖）
├─ services/
│  └─ main.service.ts # 插件主服务（核心逻辑、对外方法、资源管理）
└─ types.ts          # 插件内部私有类型（不对外暴露）



platform暴露的api为
* 实现 : renderer/src/lib/utils/plugin/shared/services/context
* 接口 : renderer/src/lib/types/platformctx