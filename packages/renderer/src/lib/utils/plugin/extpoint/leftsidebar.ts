/* eslint-disable @typescript-eslint/no-explicit-any */
// $lib/utils/plugin/extpoint/leftsidebar.ts
import { layoutStore } from '$lib/store/ui/layout.svelte';
import type { IPluginExtensionPoint, PluginBaseItem } from '$lib/types/plugin/extpoint/slot';
import Logger from 'electron-log/renderer';
import type { Component } from 'svelte';

/**
 * 角标数据源。
 * - 数字：静态角标。
 * - 函数：响应式角标；在渲染时调用，可读取 $derived / store。
 * 返回 <=0、NaN、null、undefined 时不渲染。
 */
export type SidebarBadgeSource = number | (() => number | null | undefined);

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
    /**
     * 图标右上角数字角标。
     * 对动态数据请传函数，例如：`badge: () => modelConfigStore.overrideCount`。
     * 不传或返回 <= 0 时不渲染，保持历史组件完全无感。
     */
    badge?: SidebarBadgeSource;
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