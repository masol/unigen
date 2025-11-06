import { appDB } from "$lib/utils/appdb";
import { eventBus } from "$lib/utils/evt";
import { llmCenter } from "$lib/utils/llms";
import { type LLMConfig } from "$lib/utils/llms/index.type";

const KEYNAME = "llms";

export class LLMStore {
    private unsub: (() => void) | null = null;

    llms = $state<LLMConfig[]>([]);

    find(id: string): LLMConfig | undefined {
        return this.llms.find(r => r.id === id);
    }

    async removeById(id: string) {
        const oldLLM = this.find(id);
        if (!oldLLM) {
            return;
        }
        this.llms = this.llms.filter(r => r.id !== id);

        // 主动通知llmCenter，更新llm.
        llmCenter.removeLLM(oldLLM.tag, id);
        // eventBus.emit<"llms.removed">("llms.removed", { id })
        // 所有值存在一条记录(一个id)下！！
        // await appDB.remove(id, KEYNAME, true)
        await appDB.upsertByKey(KEYNAME, JSON.stringify(this.llms), true)
    }

    async upsert(llm: LLMConfig) {
        this.llms = this.llms.map(l =>
            l.id === llm.id ? { ...l, ...llm } : l
        );
        let l = this.llms.find(l => l.id === llm.id);
        if (!l) {
            this.llms = [...this.llms, llm];
        }

        // 主动通知llmCenter,更新。
        if (l) { // 有旧值，先删除。
            llmCenter.removeLLM(l.tag, l.id);
        }
        llmCenter.addLLM(llm);
        await appDB.upsertByKey(KEYNAME, JSON.stringify(this.llms), true)
    }

    // 从数据库中加载lang配置，如果数据库未配置，则返回false.
    private async loadFromDB(): Promise<boolean> {
        const cfgs = await appDB.getConfigsByKey(KEYNAME);
        if (cfgs) {
            const llms: LLMConfig[] = cfgs.flatMap((item) => item.value as unknown as LLMConfig[]);
            this.setLLM(llms);
            return true;
        }
        return false;
    }

    private setLLM(llms: LLMConfig[]) {
        this.llms = llms;
        llmCenter.removeAllLLMs();
        llmCenter.init(llms);
        // eventBus.emit<"llms.upsert">("llms.upsert", undefined)
    }


    async init() {
        await this.loadFromDB();
        this.unsub = await eventBus.listen("cfgchanged:llms", this.loadFromDB.bind(this))
    }

    // private close() {
    //     if (this.unsub) {
    //         this.unsub();
    //         this.unsub = null;
    //     }
    // }
}

export const llmStore = new LLMStore();