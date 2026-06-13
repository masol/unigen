/**
 * 插件扩展项 基础约束
 * id：必填，唯一标识
 * order：选填，排序权重；不传则使用全局默认值
 * 业务字段由各扩展点自行定义
 */
export interface PluginBaseItem {
    id: string;
    order?: number;
}

/**
 * 【插件侧对外接口】
 * 所有扩展点统一对外行为，插件仅使用这两个方法
 */
export interface IPluginExtensionPoint<T extends PluginBaseItem> {
    /**
     * 注册插件数据
     * @param item 扩展项数据
     * @returns 注册成功返回 true；id 重复返回 false（幂等）
     */
    register(item: T): boolean;

    /**
     * 根据 id 注销/移除插件
     * @param id 扩展项唯一ID
     * @returns 注销成功返回 true；id 不存在返回 false
     */
    unregister(id: string): boolean;
}