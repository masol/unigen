/**
 * 设计：每个配置项一个独立 key（config:weave:XXX）。
 * 缺省值由各调用方在读取时自行提供——本类只负责 KV 存取。
 */

import { parseTimeout } from "$libs/utils/time.js";
import { BaseStorage } from "./base.js";
import { DetailLevel } from "./type/config.js";


export class ConfigStorage extends BaseStorage {
    protected NS = "#common:config:";

    // agent的最大step.默认50.
    getMaxSteps(): number {
        const raw = this.get<string>("maxSteps");
        if (!raw) return 50;
        const n = parseInt(raw, 10);
        return Number.isFinite(n) && n > 0 ? n : 50;
    }

    // 等待用户录入的最大超时时长，默认1小时。
    getMaxUserTimeout(): number {
        const defTimeout = 60 * 60 * 1000;
        const raw = this.get<string>("maxUserTimeout");
        if (!raw) return defTimeout;
        const n = parseTimeout(raw);
        if (!n) return defTimeout;
        return Number.isFinite(n) && n > 0 ? n : defTimeout;
    }

    // 获取自行补充细节的程度，默认全部补充。
    getDetailLevel(): DetailLevel {
        const raw = this.get<DetailLevel>("detailLevel");
        if (!raw) return DetailLevel.Partial;
        return raw;
    }
}