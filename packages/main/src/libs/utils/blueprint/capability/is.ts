//capa是静态的functor.一旦进入内存(被加载后)，转化为functor.

import { capabilities } from "$libs/utils/db/schema/capability.js";

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