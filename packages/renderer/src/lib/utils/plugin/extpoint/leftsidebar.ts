/* eslint-disable @typescript-eslint/no-explicit-any */
// $lib/utils/plugin/extpoint/leftsidebar.ts
import type { Component } from 'svelte';
import type { PluginBaseItem, IPluginExtensionPoint } from '$lib/types/plugin/extpoint/slot';

/**
 * 左侧边栏扩展项定义
 */
export interface LeftSidebarItem extends PluginBaseItem {
    /** 显示标签 */
    label: string;
    /** 图标组件（Tabler Icons） */
    icon: Component<any>;
    /** 面板内容组件 */
    component: Component<any>;
    /** 面板header组件 */
    header: Component<any> | null;
}

/**
 * 左侧边栏扩展点实现
 */
class LeftSidebarExtensionPoint implements IPluginExtensionPoint<LeftSidebarItem> {
    private items: Map<string, LeftSidebarItem> = new Map();

    register(item: LeftSidebarItem): boolean {
        if (this.items.has(item.id)) {
            return false; // 幂等：id 已存在
        }
        this.items.set(item.id, item);
        return true;
    }

    unregister(id: string): boolean {
        return this.items.delete(id);
    }

    /**
     * 获取所有已注册的侧边栏项（按 order 排序）
     */
    getAll(): LeftSidebarItem[] {
        return Array.from(this.items.values()).sort(
            (a, b) => (a.order ?? 100) - (b.order ?? 100)
        );
    }

    /**
     * 根据 id 获取单个扩展项
     */
    getById(id: string): LeftSidebarItem | undefined {
        return this.items.get(id);
    }

    /**
     * 检查扩展项是否存在
     */
    has(id: string): boolean {
        return this.items.has(id);
    }

}

// 导出单例实例
export const leftSidebarExtPoint = new LeftSidebarExtensionPoint();