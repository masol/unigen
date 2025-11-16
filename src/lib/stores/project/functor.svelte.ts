import { eventBus } from "$lib/utils/evt";
import { TypeFunctor, type FunctorData } from "$lib/utils/vocab/type";
import { WordStore } from "./word.svelte";

export class FunctorStore extends WordStore<FunctorData> {
    type = TypeFunctor;
    // 删除一个word之后，额外处理．
    async _delPost(data: FunctorData): Promise<void> {
        return eventBus.emit("functor.remove", { ...data });
    }
    async _renamePost(word: FunctorData): Promise<void> {
        // console.log("renamed:",word)
        return eventBus.emit("functor.updated", word);
    }

}

export const functorStore = new FunctorStore();