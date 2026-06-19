import type { CommandDescriptor } from "./type";

import {
    push
} from "svelte-spa-router";

export const builtins: CommandDescriptor[] = [
    // ── 命令中心 ──
    // ── 导航 ──
    {
        id: 'navigation.reload',
        label: '刷新页面',
        category: 'Navigation',
        handler: () => location.reload(),
    },
    {
        id: 'navigation.back',
        label: '后退',
        category: 'Navigation',
        handler: () => history.back(),
    },
    {
        id: 'navigation.back',
        label: '后退',
        category: 'Navigation',
        handler: () => history.back(),
    },
    {
        id: 'navigation.home',
        label: '前进',
        category: 'Navigation',
        handler: () => push("/"),
    },

    // ── 外观 ──
    {
        id: 'appearance.toggleDarkMode',
        label: '切换暗色模式',
        category: 'Appearance',
        description: '在 <html> 上切换 dark 类',
        handler: () => {
            document.documentElement.classList.toggle('dark');
            document.documentElement.classList.contains('dark');
        },
    },
    {
        id: 'appearance.toggleFullscreen',
        label: '切换全屏',
        category: 'Appearance',
        handler: async () => {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen();
                return true;
            }
            await document.exitFullscreen();
            return false;
        },
    },
    {
        id: 'appearance.scrollToTop',
        label: '滚动到顶部',
        category: 'Appearance',
        handler: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
    },
    {
        id: 'appearance.scrollToBottom',
        label: '滚动到底部',
        category: 'Appearance',
        handler: () =>
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }),
    },

    // ── 开发者工具 ──
    {
        id: 'dev.clearConsole',
        label: '清空控制台',
        category: 'Developer',
        handler: () => console.clear(),
    },
    {
        id: 'dev.logInfo',
        label: '打印页面信息',
        category: 'Developer',
        handler: () => {
            const info = {
                url: location.href,
                title: document.title,
                viewport: `${innerWidth}×${innerHeight}`,
                devicePixelRatio,
                language: navigator.language,
            };
            console.table(info);
            return info;
        },
    },

    // ── 存储 ──
    {
        id: 'storage.localClear',
        label: 'localStorage 清空',
        category: 'Storage',
        handler: () => {
            localStorage.clear();
            return true;
        },
    },
];