import { appDB } from "$lib/utils/appdb";
import { eventBus } from "$lib/utils/evt";

const KEYNAME = 'light'
export class LightStore {
    mode = $state<string>("light");
    #unsub: (() => void) | null = null;

    async init() {
        await this.loadFromDB();
        this.#unsub = await eventBus.listen(`cfgchanged:${KEYNAME}`, this.loadFromDB.bind(this))
    }

    async setMode(mode: 'dark' | 'light', bNotify = true) {
        if (this.mode === mode) return;
        this.mode = mode;
        console.log("call into setMode=", mode, bNotify)
        await appDB.upsertByKey(KEYNAME, JSON.stringify({ mode }), bNotify);
        eventBus.emit("theme.change", { dark: this.mode === 'dark' });
    }

    // 从数据库中加载lang配置，如果数据库未配置，则返回false.
    private async loadFromDB(): Promise<boolean> {
        const cfgs = await appDB.getConfigsByKey(KEYNAME);
        if (cfgs && cfgs.length > 0) {

            const oldMode = this.mode;
            this.mode = cfgs[0].value.mode as string;
            document.documentElement.setAttribute('data-mode', this.mode);
            if (oldMode !== this.mode) {
                eventBus.emit("theme.change", { dark: this.mode === 'dark' });
            }
            return true;
        }
        return false;
    }

    close() {
        if (this.#unsub) {
            this.#unsub();
            this.#unsub = null;
        }
    }
}

export const lightStore = new LightStore();