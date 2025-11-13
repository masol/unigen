import { projectBase } from "$lib/utils/appdb/project";
import type { EntityData } from "$lib/utils/vocab/type";

export class EntityStore {
    entities = $state<EntityData[]>([]);

    async reinit() { // 从项目库中加载--每次打开项目都会调用一次！
        this.entities = await projectBase.vocabdb.getAllByType("entity");
    }

    async toggleExpand(entityId: string) {
        const entity = this.entities.find(e => e.id === entityId);
        if (entity) {
            entity.expand = !entity.expand;
            await projectBase.vocabdb.upsert(entity);
        }
    }
}

export function getViewId(entityId: number): string {
    return `ent::${entityId}`
}

export const entityStore = new EntityStore();

