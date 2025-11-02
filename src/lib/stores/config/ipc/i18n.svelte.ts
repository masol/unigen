import {
    setLocale as internalSetLocale,
    baseLocale,
    locales,
    type Locale,
} from '$lib/paraglide/runtime.js';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { eventBus } from '$lib/utils/evt';
import { appDB } from '$lib/utils/appdb';
import { softinfo } from '$lib/utils/softinfo';
import { m } from '$lib/paraglide/messages.js';
import { logger } from '$lib/utils/logger';

dayjs.extend(relativeTime);

/* ---------- 类型与常量 ---------- */

type MessageKey = keyof typeof m;
type MessageParams<K extends MessageKey> = Parameters<typeof m[K]>;

// // Day.js locale 映射表（处理特殊情况）
// const DAYJS_LOCALE_MAP: Record<string, string> = {
//     'zh-CN': 'zh-cn',
//     'zh-TW': 'zh-tw',
//     'en': 'en',
//     'es': 'es',
//     'ko': 'ko',
//     'ru': 'ru',
//     'ja': 'ja',
// };

/**
 * 动态加载 Day.js 语言包
 */
async function loadDayjsLocale(locale: string): Promise<void> {
    // const dayjsLocale = DAYJS_LOCALE_MAP[locale] || locale.toLowerCase();
    const dayjsLocale = locale.toLowerCase();
    try {
        // 使用动态导入加载对应的语言包
        await import(`./dayjs/${dayjsLocale}.js`);
        dayjs.locale(dayjsLocale);
    } catch (error) {
        logger.warn(`Failed to load dayjs locale: ${dayjsLocale}`, error as Error);
        // 降级到英语
        try {
            await import('./dayjs/en.js');
            dayjs.locale('en');
        } catch {
            // 如果连英语都加载失败，使用默认
            // dayjs.locale('en');
        }
    }
}

/**
 * 创建响应式翻译
 */
export function t<K extends MessageKey>(
    key: K | string,  // 添加string,因为添加元素会让lint报错，每次需要重建缓冲，否则报错．不密集翻译时，移除 | string
    ...params: MessageParams<K>
): string {
    const _ = localeStore.lang;
    void (_);
    return Reflect.apply(m[key as K], null, params) as string;
}

function isValidLocale(str: string): str is Locale {
    return (locales as unknown as string[]).includes(str);
}

/**
 * 把任何 BCP 47 tag 折叠成最接近的、项目里实际拥有的语言。
 */
export function nearestLocale(wanted: string): Locale | undefined {
    try {
        const loc = new Intl.Locale(wanted);
        const baseName = loc.baseName.toLowerCase();
        if (isValidLocale(baseName)) return baseName;

        const lang = loc.language;
        return locales.find(a => new Intl.Locale(a).language === lang);
    } catch {
        return undefined;
    }
}

/* ---------- 工具 ---------- */

class LocalStore {
    lang = $state<string>(baseLocale);
    #unsub: (() => void) | null = null;

    async setLocale(next: string, save = true) {
        if (next === this.lang) return;

        const realLang = nearestLocale(next);
        if (!realLang) {
            throw new Error(`Locale "${next}" is not available`);
        }

        // 先加载 Day.js 语言包
        await loadDayjsLocale(realLang);

        // 再设置应用语言
        await internalSetLocale(realLang, { reload: false });
        this.lang = realLang;

        if (save) {
            await appDB.upsertByKey("lang", JSON.stringify({ lang: realLang }));
        }
    }

    private async loadFromDB(): Promise<boolean> {
        const cfgs = await appDB.getConfigsByKey("lang");
        if (cfgs && cfgs.length > 0) {
            await this.setLocale(cfgs[0].value.lang as string, false);
            return true;
        }
        return false;
    }

    async init() {
        const loaded = await this.loadFromDB();
        if (!loaded && softinfo.locale) {
            await this.setLocale(softinfo.locale, false);
        }
        this.#unsub = await eventBus.listen("cfgchanged:lang", this.loadFromDB.bind(this));
    }

    close() {
        if (this.#unsub) {
            this.#unsub();
            this.#unsub = null;
        }
    }
}

/* ---------- 导出单例 ---------- */
export const localeStore = new LocalStore();