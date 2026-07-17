import { intereg } from "$libs/blueprint/capability/intereg.js";
import { capabilities } from "$libs/utils/db/schema/capability.js";
import { throwNotimplement } from "$libs/utils/err.js";
import type { Capability, NewCapability } from "$types/blueprint/capability.js";
import { PrjTimeStamps } from "$types/prjstore.js";
import { eq } from 'drizzle-orm';
import type { DrizzleDBType } from "./type.js";

export function upsertCapability(db: DrizzleDBType, capability: NewCapability): string {
    if (intereg.hasId(capability.id ?? "")) {
        throwNotimplement(`internal capa id upcert not implemented: ${capability.id}`);
    }
    const { createdAt, updatedAt, id, ...updateData } = capability;
    void (createdAt);
    void (updatedAt);
    const finalId = id ?? crypto.randomUUID();

    db.insert(capabilities)
        .values({ id: finalId, ...updateData })
        .onConflictDoUpdate({
            target: capabilities.id,
            //  无需硬编码：直接把剩余字段整体塞给 set
            //    Drizzle 内部自动处理，不用 sql`excluded.xxx`
            set: updateData,
        })
        .run();

    return finalId;
}


export function getCapabilityById(db: DrizzleDBType, id: string): Capability | null {
    // Logger.debug(`[PrjDB] getCapabilityById: ${id}`);
    const internalCapa = intereg.capaById(id);
    if (internalCapa) {
        return internalCapa;
    }
    const result = db
        .select()
        .from(capabilities)
        .where(eq(capabilities.id, id))
        .get(); // 立刻返回结果或 undefined

    // SQLite 未命中时返回 undefined，我们统一转换为 null 或对象
    return result ? result : null;
}

export function deleteCapabilityById(db: DrizzleDBType, id: string): void {
    const internalCapa = intereg.capaById(id);
    if (internalCapa) {
        throwNotimplement(`internal capa id delete not implemented: ${id}`);
    }
    db.delete(capabilities)
        .where(eq(capabilities.id, id))
        .run()
}

export function getCapaTimestamps(
    db: DrizzleDBType,
    id: string
): PrjTimeStamps | null {
    if (!id) return null;
    const row = db
        .select({
            createdAt: capabilities.createdAt,
            updatedAt: capabilities.updatedAt,
        })
        .from(capabilities)
        .where(eq(capabilities.id, id))
        .get();
    return row ?? null;
}
