/* eslint-disable @typescript-eslint/no-explicit-any */
// $lib/utils/plugin/extpoint/leftsidebar.ts
import type { Component } from 'svelte';
import type { PluginBaseItem, IPluginExtensionPoint } from '$lib/types/plugin/extpoint/slot';
import Logger from 'electron-log/renderer';
import { routerStore } from '$lib/store/route.svelte';

/**
 * 页面扩展定义
 */
export interface PageInfo extends PluginBaseItem {
    /** 路径 */
    path: string;
    /** 路径对应组件 */
    component: Component<any>;
}

/**
 * 左侧边栏扩展点实现
 */
class PageExtPoint implements IPluginExtensionPoint<PageInfo> {
    register(item: PageInfo): boolean {
        if (routerStore.hasRoute(item.path)) {
            Logger.info(`[PageExtension] Page ${item.id} already exist.`)
            return false;
        }
        routerStore.addRoute(item.path, item.component);
        return true;
    }

    unregister(id: string): boolean {
        if (routerStore.hasRoute(id)) {
            routerStore.removeRoute(id);
            return true;
        }
        return false;
    }
}

// 导出单例实例
export const pageExtPoint = new PageExtPoint();