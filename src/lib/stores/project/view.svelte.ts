// 维护打开的tab,用于dynamic tab.

import { projectBase } from "$lib/utils/appdb/project";
import { isArray } from "remeda";


const KEYNAME = "views";

export type ViewType = "settings" | "entgeneral" | "function" | "flow"
export type ViewItemType = {
    id: string;
    label: string; // 这里传入的是key，通过t[key]来渲染。
    closable: boolean;
    docId?: string; // 存储的文档id.
    type: ViewType; // 视口类型.
}

type DbValueType = {
    tabs: ViewItemType[];
    activeId: string;
}

export class ViewStore {
    tabs = $state<ViewItemType[]>([]);
    activeId = $state("")
    selectedItem = $state(""); // 在view中指示第一级选中．对flow chart view而言，是选中的node id.

    async reinit() { // 从项目库中加载--每次打开项目都会调用一次！
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

    async setActive(id: string) {
        if (this.activeId !== id && this.findById(id)) {
            this.activeId = id;
            this.selectedItem = "";
            await this.save2db();
        }
    }

    private async loadfromdb(): Promise<boolean> {
        const cfgdb = projectBase.cfgdb;
        if (cfgdb) {
            try {
                const dbValue = await cfgdb.getConfigsByKey<DbValueType>(KEYNAME);
                if (dbValue && dbValue.length > 0 && isArray(dbValue[0].value?.tabs)) {
                    this.tabs = dbValue[0].value?.tabs;
                    this.activeId = dbValue[0].value?.activeId;
                    this.selectedItem = "" // 选中未在view中响应式处理．
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
            const dbValue: DbValueType = {
                tabs: this.tabs,
                activeId: this.activeId
            }
            return (await cfgdb.upsertByKey(KEYNAME, JSON.stringify(dbValue))).success;
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