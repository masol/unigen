import type { IconifyJSON } from '@iconify/svelte';
let cache: string[] | null = null;
/** 返回全部 twemoji 图标名，形如 "twemoji:fire"。模块级缓存，只算一次。 */
export async function loadTwemojiNames(): Promise<string[]> {
    if (cache) return cache;
    const mod = await import('@iconify-json/twemoji/icons.json');
    const json = (mod.default ?? mod) as unknown as IconifyJSON;
    const prefix = json.prefix;
    cache = Object.keys(json.icons)
        .map((n) => `${prefix}:${n}`)
        .sort();
    return cache;
}