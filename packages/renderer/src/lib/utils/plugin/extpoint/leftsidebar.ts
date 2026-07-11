/* eslint-disable @typescript-eslint/no-explicit-any */
// $lib/utils/plugin/extpoint/leftsidebar.ts
import { layoutStore } from '$lib/store/ui/layout.svelte';
import type { IPluginExtensionPoint, PluginBaseItem } from '$lib/types/plugin/extpoint/slot';
import Logger from 'electron-log/renderer';
import type { Component } from 'svelte';

/**
 * 左侧边栏扩展项定义
 */
export interface LeftSidebarItem extends PluginBaseItem {
    /** 显示标签 */
    label: string;
    /** 图标组件（Tabler Icons） */
    icon: string;
    /** 面板内容组件 */
    component: Component<any>;
    /** 面板header组件 */
    header?: Component<any> | null;
    // 添加属性信息。
    props?: Record<string, unknown>;
}

/**
 * 左侧边栏扩展点实现
 */
class LeftSidebarExtensionPoint implements IPluginExtensionPoint<LeftSidebarItem> {
    register(item: LeftSidebarItem): boolean {
        if (layoutStore.hasActivity(item.id)) {
            Logger.info(`[LeftExtension] activity ${item.id} already exist.`)
            return false;
        }
        layoutStore.addActivity(item);
        return true;
    }

    unregister(id: string): boolean {
        if (layoutStore.hasActivity(id)) {
            layoutStore.removeActivity(id);
            return true;
        }
        return false;
    }
}

// 导出单例实例
export const leftSidebarExtPoint = new LeftSidebarExtensionPoint();