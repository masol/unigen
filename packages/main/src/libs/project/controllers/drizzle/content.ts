// packages/main/src/libs/project/controllers/drizzle/content.ts
//
// getContent / setContent 的实现从 PrjDB 外提。
// 复用同目录下的 capa / metag / kvstore 模块函数。

import { metagFromJson, metagToJson } from '$libs/blueprint/metag/is.js';
import { throwNotfound, throwNotimplement } from '$libs/utils/err.js';
import type { GetItemInput, SetItem } from '$types/shared/api/list.js';
import { getCapabilityById, upsertCapability } from './capa.js';
import { getKV, setKV } from './kvstore.js';
import { getMetag, upcertMetag } from './metag.js';
import type { DrizzleDBType } from './type.js';

export function getContent(
    db: DrizzleDBType,
    { kind, id, content, noThrow }: GetItemInput
): string {
    switch (kind) {
        case 'capa': {
            const capa = getCapabilityById(db, id);
            if (!capa) {
                if (!noThrow) throwNotfound(`没有id为"${id}"的能力。`);
                return '';
            }
            if (content) return capa.code;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { updatedAt, createdAt, code, ...safeCapa } = capa;
            return JSON.stringify(safeCapa, null, 2);
        }
        case 'glossary': {
            const value = getKV<string>(db, id);
            if (value === null) {
                if (!noThrow) throwNotfound(`没有key为"${id}"的术语。`);
                return '';
            }
            if (content || id.startsWith('_')) return value;
            return JSON.stringify(value, null, 2);
        }
        case 'metag': {
            const value = getMetag(db, id)[0];
            if (value === null) {
                if (!noThrow) throwNotfound(`没有fieldKey为"${id}"的元术语。`);
                return '';
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { updatedAt, createdAt, ...jsonValue } = metagToJson(value)!;
            return JSON.stringify(jsonValue, null, 2);
        }
        default:
            if (!noThrow) throwNotimplement(`试图获取未支持的kind:${kind}`);
            return '';
    }
}

export function setContent(
    db: DrizzleDBType,
    { kind, id, content, code }: SetItem
): string {
    switch (kind) {
        case 'capa': {
            if (code) {
                return upsertCapability(db, { id, code: content });
            }
            const cntJson = JSON.parse(content);
            // 剔除持有者传过来的 code 字段，避免误覆盖
             
            const { code: _c, ...rest } = { ...cntJson, id };
            return upsertCapability(db, rest);
        }
        case 'glossary': {
            if (id.startsWith('_') || code) {
                setKV(db, id, content);
            } else {
                setKV(db, id, JSON.parse(content));
            }
            return id;
        }
        case 'metag': {
            const cntJson = JSON.parse(content);
            const metag = metagFromJson(cntJson);
            upcertMetag(db, { ...metag, fieldKey: id });
            return id;
        }
        default:
            throwNotimplement(`试图写入未支持的kind:${kind}`);
    }
}