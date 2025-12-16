import { TypeFlow, type FlowData } from "$lib/utils/vocab/type";
import { WordStore } from "./word.svelte";

export class FlowStore extends WordStore<FlowData> {
    type = TypeFlow;
    // 删除一个word之后，额外处理．
    async _delPost(data: FlowData): Promise<void> { void (data) }
    async _renamePost(word: FlowData): Promise<void> { void (word) }

}

export const flowStore = new FlowStore();