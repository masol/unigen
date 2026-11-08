// packages/main/src/libs/blueprint/capability/local/agent/utils.ts

import { configService } from "$libs/store/index.js";
import humanizeDuration from "humanize-duration";

export interface FormatDurationOptions {
    /** humanize-duration 的最大小数位；不传则沿用其默认行为 */
    maxDecimalPoints?: number;
}

/**
 * 将毫秒时长格式化为本地化的人类可读文本。
 *
 * - 负值会被钳制为 0，防御时钟回拨或错误入参。
 * - language 取用户配置，fallbacks 固定为 zh-cn / en，保证缺语言包时仍有可读输出。
 * - maxDecimalPoints 仅在调用方显式传入时下发，避免改变既有的短耗时显示。
 */
export function formatDurationMs(
    ms: number,
    options: FormatDurationOptions = {},
): string {
    const { maxDecimalPoints = 3 } = options;
    return humanizeDuration(Math.max(0, ms), {
        language: (configService().get("lang") ?? "zh-CN").replace('-', '_'),
        fallbacks: ["zh_CN", "en"],
        ...(maxDecimalPoints !== undefined ? { maxDecimalPoints } : {}),
    });
}