import { TypeEntity, type EntityData } from "$lib/utils/vocab/type";
import { WordStore } from "./word.svelte";

export class EntityStore extends WordStore<EntityData> {
    type = TypeEntity;
    // 删除一个word之后，额外处理．
    async _delPost(data: EntityData): Promise<void> { }
    async _renamePost(word: EntityData): Promise<void> { }

}

export const entityStore = new EntityStore();

