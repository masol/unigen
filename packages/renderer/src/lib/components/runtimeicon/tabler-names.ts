import * as TablerIcons from '@tabler/icons-svelte';

/**
 * 提取全部 Tabler 图标组件名（以 Icon 开头）。
 * 这是个稍重的计算，用模块级常量缓存，全应用只算一次。
 */
export const TABLER_ICON_NAMES: string[] = Object.keys(TablerIcons)
    .filter((key) => key.startsWith('Icon') && /^[A-Z]/.test(key.charAt(4)))
    .sort();