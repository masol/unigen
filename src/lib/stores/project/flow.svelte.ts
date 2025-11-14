
import { projectBase } from "$lib/utils/appdb/project";
import { TypeFlow, type FlowData } from "$lib/utils/vocab/type";
import { updateStore } from "./utils";

export class FlowStore {
    items = $state<FlowData[]>([]);

    async reinit() { // 从项目库中加载--每次打开项目都会调用一次！
        this.items = await projectBase.vocabdb.getAllByType(TypeFlow);
    }

    update(item: FlowData) {
        updateStore(this, item);
    }
}

export const flowStore = new FlowStore();