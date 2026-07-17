//capa是静态的functor.一旦进入内存(被加载后)，转化为functor.

import { capabilities } from "$libs/utils/db/schema/capability.js";
import { isString } from "radashi";
// 全局导入，validator做为全局对象，会传递给code型capability.因此这里全局引入，以规避commonjs解析问题。
import validator from 'validator';

/**
 * 3. 导出ts类型。
 */
export type Capability = typeof capabilities.$inferSelect;
export type NewCapability = typeof capabilities.$inferInsert;
// Partial<Capability>


type CapaNameType = string | null | undefined;
// 通过capa.name来判断，传入capa.name
export function isWorkflow(name: CapaNameType): boolean {
    if (!name) {
        return false;
    }
    return name.startsWith("#workflow");
}

export function isCode(name: CapaNameType): boolean {
    if (!name) {
        return false;
    }
    return name.startsWith("#code");
}

export function isCapability(value: unknown): value is NewCapability {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const record = value as Record<string, unknown>;
    if (isString(record.id)) {
        return validator.isUUID(record.id);
    }
    return false;
}


const interPrefix = "#inter::"

// 返回internal函数名的完整名称。
export function fullInternalName(name: string): string {
    return interPrefix + name;
}

// 返回internal函数名。如果不是，则返回null。
export function getInternalName(name: CapaNameType): string | null {
    // 判空，避免 name 为 undefined 报错
    if (name?.startsWith(interPrefix)) {
        // 截取 #inter:: 后面的剩余内容
        return name.slice(interPrefix.length);
    }
    // 不匹配则返回null
    return null;
}


const planPrefix = "#plan::"
// 如果是一个plan,则返回其字符串，否则，返回null.
export function getPlanDesc(name: CapaNameType): string | null {
    if (name?.startsWith(planPrefix)) {
        // 截取 #plan:: 后面的剩余内容
        return name.slice(planPrefix.length);
    }
    // 不匹配则返回null
    return null;
}

export function makePlanDesc(desc: string): string {
    return `${planPrefix}${desc}`
}