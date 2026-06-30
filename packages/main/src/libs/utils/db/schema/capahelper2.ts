import { capabilities } from "./capability.js";

/**
 * 3. 一键导出
 */
// export type Capability = typeof capabilities.$inferSelect;
export type Capability = typeof capabilities.$inferInsert;
export type PartialCapa = Partial<Capability>


export function isWorkflow(capa: Capability): boolean {
    if (!capa.name) {
        return false;
    }
    return capa.name?.startsWith("#workflow");
}


// 返回internal函数名。如果不是，则返回空字符串。
const interPrefix = "#inter::"
export function getInternalName(capa: Capability): string {
    // 判空，避免 name 为 undefined 报错
    if (capa.name?.startsWith(interPrefix)) {
        // 截取 #inter:: 后面的剩余内容
        return capa.name.slice(interPrefix.length);
    }
    // 不匹配则返回空字符串
    return "";
}