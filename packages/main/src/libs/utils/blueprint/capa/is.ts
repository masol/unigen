import { capabilities } from "$libs/utils/db/schema/capability.js";

/**
 * 3. 导出ts类型。
 */
export type Capability = typeof capabilities.$inferInsert;
export type PartialCapa = Partial<Capability>


export function isWorkflow(capa: Capability): boolean {
    if (!capa.name) {
        return false;
    }
    return capa.name?.startsWith("#workflow");
}


const interPrefix = "#inter::"

// 返回internal函数名的完整名称。
export function fullInternalName(name: string): string {
    return interPrefix + name;
}

// 返回internal函数名。如果不是，则返回null。
export function getInternalName(capa: Capability): string | null {
    // 判空，避免 name 为 undefined 报错
    if (capa.name?.startsWith(interPrefix)) {
        // 截取 #inter:: 后面的剩余内容
        return capa.name.slice(interPrefix.length);
    }
    // 不匹配则返回null
    return null;
}