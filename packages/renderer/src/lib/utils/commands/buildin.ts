// packages/renderer/src/lib/utils/commands/buildin.ts
import { configStore } from "$lib/store/config.svelte";
import { projectStore } from "$lib/store/project.svelte";
import { safeApi } from "../api";
import { AppearanceBuildin } from "./appearance";
import type { CommandDescriptor } from "./type";

import {
    push
} from "@keenmate/svelte-spa-router";

export const builtins: CommandDescriptor[] = [
    // ── 导航 ──
    {
        id: 'navigation.home',
        label: '回到工作台',
        category: 'Navigation',
        handler: () => push("/"),
    },
    {
        id: 'navigation.back',
        label: '后退',
        category: 'Navigation',
        handler: () => history.back(),
    },
    {
        id: 'navigation.forward',
        label: '前进',
        category: 'Navigation',
        handler: () => history.forward(),
    },
    {
        id: 'navigation.reload',
        label: '刷新页面',
        category: 'Navigation',
        // 刷新页面 → 需重新载入开发者面板，归入 devOnly。
        devOnly: true,
        handler: () => location.reload(),
    },
    // ── 外观 ──
    {
        id: 'appearance.toggleDarkMode',
        label: '下一主题',
        category: 'Appearance',
        description: '循环设置主题',
        handler: () => {
            configStore.cycleTheme();
        },
    },
    ...AppearanceBuildin,
    // ── 项目 ──
    {
        id: 'project.open',
        label: '打开项目',
        category: 'Project',
        handler: () => projectStore.open(),
    },
    {
        id: 'project.create',
        label: '新建项目',
        category: 'Project',
        handler: () => projectStore.create(),
    },
    {
        id: 'project.close',
        label: '关闭项目',
        category: 'Project',
        handler: () => projectStore.close(),
    },

    // ── 开发者工具（devOnly） ──
    {
        id: 'dev.icon-playground',
        label: '查看图标试验台',
        category: 'Developer',
        devOnly: true,
        handler: () => push('/dev/icon-playground')
    },
    {
        id: 'dev.icons',
        label: '查看Tabler图标库',
        category: 'Developer',
        devOnly: true,
        handler: () => push('/dev/icons')
    },
    {
        id: 'dev.emojis',
        label: '查看Emoji库',
        category: 'Developer',
        devOnly: true,
        handler: () => push('/dev/emojis')
    },
    {
        id: 'dev.clearConsole',
        label: '清空工作台',
        category: 'Developer',
        devOnly: true,
        handler: () => console.clear(),
    },
    {
        id: 'dev.logInfo',
        label: '打印页面信息',
        category: 'Developer',
        devOnly: true,
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
    {
        id: 'dev.toogleDevTools',
        label: '切换开发者工具',
        category: 'Developer',
        devOnly: true,
        handler: () => safeApi().window.toggleDevtools(),
    },

    // ── 局部热键命令 ──
    // handler 为空占位；实际触发点在宿主组件内通过 configStore.keybinding 匹配。
    // local: true 表示不注册到全局 hotkeys-js。
    {
        id: 'header.commandPalette',
        label: '打开命令面板',
        category: 'Navigation',
        description: '打开或关闭顶部命令面板',
        // local: true,
        // 占位：实际触发在 CommandPaletteBar 的 window keydown
        handler: () => { /* noop */ },
    },
    {
        id: 'chat.send',
        label: '发送聊天消息',
        category: 'Chat',
        description: '在聊天输入框中发送消息（局部热键）',
        local: true,
        // 占位：实际触发在 ChatInput 的 textarea keydown
        handler: () => { /* noop */ },
    },
];