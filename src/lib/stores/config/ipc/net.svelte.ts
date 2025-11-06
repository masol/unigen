import { appDB } from "$lib/utils/appdb";
import { eventBus } from "$lib/utils/evt";
import { proxy, type ProxyConfig } from "$lib/utils/proxy";


const KEYNAME = "network";

export class NetStore {
    private unsub: (() => void) | null = null;

    nets = $state<ProxyConfig[]>([]);

    find(id: string): ProxyConfig | undefined {
        return this.nets.find(r => r.id === id);
    }

    async removeById(id: string) {
        const oldNet = this.find(id);
        if (!oldNet) {
            return;
        }
        this.nets = this.nets.filter(r => r.id !== id);

        proxy.setProxies(this.nets);
        await appDB.upsertByKey(KEYNAME, JSON.stringify(this.nets), true)
    }

    async upsert(net: ProxyConfig) {
        this.nets = this.nets.map(l =>
            l.id === net.id ? { ...l, ...net } : l
        );
        let l = this.nets.find(l => l.id === net.id);
        if (!l) {
            this.nets = [...this.nets, net];
        }

        proxy.setProxies(this.nets);
        await appDB.upsertByKey(KEYNAME, JSON.stringify(this.nets), true)
    }

    private setProxies(nets: ProxyConfig[]) {
        this.nets = nets;
        proxy.setProxies(this.nets);
    }

    // 从数据库中加载lang配置，如果数据库未配置，则返回false.
    private async loadFromDB(): Promise<boolean> {
        const cfgs = await appDB.getConfigsByKey(KEYNAME);
        if (cfgs) {
            const nets: ProxyConfig[] = cfgs.flatMap((item) => item.value as unknown as ProxyConfig[]);
            this.setProxies(nets);
            return true;
        }
        return false;
    }


    async init() {
        await this.loadFromDB();
        this.unsub = await eventBus.listen(`cfgchanged:${KEYNAME}`, this.loadFromDB.bind(this))
    }

    // private close() {
    //     if (this.unsub) {
    //         this.unsub();
    //         this.unsub = null;
    //     }
    // }
}

export const netStore = new NetStore();