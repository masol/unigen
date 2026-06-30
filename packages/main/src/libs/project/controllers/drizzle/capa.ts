import { capabilities } from "$libs/utils/db/schema/capability.js";
import type { Capability } from "$types/blueprint/capability.js";
import type { DrizzleDBType } from "./type.js";
import { eq } from 'drizzle-orm'

export function upsertCapability(db: DrizzleDBType, capability: Partial<Capability>): Capability {
    const result = db
        .insert(capabilities)
        .values({
            ...capability,
            id: capability.id,
        })
        .onConflictDoUpdate({
            target: capabilities.id,
            // ✨ Drizzle 3.0+ 官方标准写法：直接把用户传进来的对象字段塞给 set
            // 这样 Drizzle 内部会自动处理，不需要写任何 sql`excluded.xxx`
            set: {
                name: capability.name,
                role: capability.role,
                goal: capability.goal,
                input: capability.input,
                output: capability.output,
                process: capability.process,
                negative: capability.negative,
                criteria: capability.criteria,
                fewshot: capability.fewshot,
                // 故意不传 createdAt，防止它被覆盖
            }
        })
        .returning()
        .get();

    return result;
}


export function getCapabilityById(db: DrizzleDBType, id: string): Capability | null {
    const result = db
        .select()
        .from(capabilities)
        .where(eq(capabilities.id, id))
        .get(); // 立刻返回结果或 undefined

    // SQLite 未命中时返回 undefined，我们统一转换为 null 或对象
    return result ? result : null;
}

export function deleteCapabilityById(db: DrizzleDBType, id: string): Capability | null {
    const result = db
        .delete(capabilities)
        .where(eq(capabilities.id, id))
        .returning() // 告诉 SQLite 必须返回被删除的行数据
        .get();      // 同步获取被删除的对象。若没找到对应的 ID，返回 undefined

    return result ? result : null;
}