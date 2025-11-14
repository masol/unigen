import { projectBase } from "$lib/utils/appdb/project";
import { TypeEntity, type EntityData } from "$lib/utils/vocab/type";
import { updateStore } from "./utils";

export class EntityStore {
    items = $state<EntityData[]>([]);

    async reinit() { // 从项目库中加载--每次打开项目都会调用一次！
        this.items = await projectBase.vocabdb.getAllByType(TypeEntity);
    }

    update(item: EntityData) {
        updateStore(this, item);
    }

}

export const entityStore = new EntityStore();

