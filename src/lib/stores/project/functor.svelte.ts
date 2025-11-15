import { TypeFunctor, type FunctorData } from "$lib/utils/vocab/type";
import { WordStore } from "./word.svelte";

export class FunctorStore extends WordStore<FunctorData> {
    type = TypeFunctor;
    // 删除一个word之后，额外处理．
    async _delPost(data: FunctorData): Promise<void> {
    }
    async _renamePost(word: FunctorData): Promise<void> { }

}

export const functorStore = new FunctorStore();