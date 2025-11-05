// 维护打开的tab,用于dynamic tab.

import { projectBase } from "$lib/utils/appdb/project";
import { isArray } from "remeda";


const KEYNAME = "views";

export type ViewType = "settings" | "prompt" | "flow"
export type ViewItemType = {
    id: string;
    label: string; // 这里传入的是key，调用者通过t[key]来渲染。
    closable: boolean;
    docId?: string; // 存储的文档id.
    type: ViewType; // 视口类型.
}

export class ViewStore {
    tabs = $state<ViewItemType[]>([]);
    activeId = $state("")

    async init() { // 从项目库中加载
        this.activeId = ""
        this.tabs = [];
        await this.loadfromdb();
        if (this.tabs.length > 0) {
            this.activeId = this.tabs[0].id;
        }
    }

    get currentView(): ViewItemType | undefined {
        return this.findById(this.activeId);
    }

    findById(id: string): ViewItemType | undefined {
        return this.tabs.find(item => item.id === id);
    }

    setActive(id: string) {
        if (this.findById(id)) {
            this.activeId = id;
            console.log("set activeid = ", id)
        }
    }

    private async loadfromdb(): Promise<boolean> {
        const cfgdb = projectBase.cfgdb;
        if (cfgdb) {
            try {

                const items = await cfgdb.getConfigsByKey(KEYNAME);
                if (items && items.length > 0 && isArray(items[0].value)) {
                    this.tabs = (items[0].value as unknown as ViewItemType[])
                }
            } catch {
                return false;
            }
        }
        return false;
    }

    private async save2db(): Promise<boolean> {
        const cfgdb = projectBase.cfgdb;
        if (cfgdb) {
            return (await cfgdb.upsertByKey(KEYNAME, JSON.stringify(this.tabs))).success;
        }
        return false;
    }

    addView(item: ViewItemType) {
        let added = false;
        if (!this.findById(item.id)) {
            this.tabs = [item, ...this.tabs];
            added = true;
        }
        this.setActive(item.id);
        if (added) {
            return this.save2db();
        }
    }

    removeView(tabId: string): Promise<boolean> {
        this.tabs = this.tabs.filter((tab) => tab.id !== tabId);

        if (this.activeId === tabId) {
            if (this.tabs.length > 0) {
                this.activeId = this.tabs[this.tabs.length - 1].id;
            } else {
                this.activeId = '';
            }
        }

        return this.save2db();
    }
}


export const viewStore = new ViewStore();