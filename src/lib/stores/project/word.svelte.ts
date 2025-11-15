import { projectBase } from "$lib/utils/appdb/project";
import { TypeEntity, type EntityData, TypeFlow, TypeFunctor, type WordData, type WordType } from "$lib/utils/vocab/type";
import type { NavType } from "../navpanel/nav.svelte";
import { viewStore, type ViewType } from "./view.svelte";


export function getViewId(id: string, type: WordType) {
    return `${type}::${id}`
}

const navType2wordType: Record<string, WordType> = {
    entities: TypeEntity,
    transformer: TypeFunctor,
    flowchart: TypeFlow
};

// 从ViewType转化为WordType.
export function wordTypeFromNav(type: NavType): WordType | undefined {
    return navType2wordType[type];
}

export function viewTypeFromWord(type: WordType): ViewType {
    switch (type) {
        case 'entity':
            return 'entities';
        case "functor":
            return 'function';
        case "flow":
            return 'flow';
    }
}

export function updateStore<T extends WordData>(store: { items: T[] }, item: T) {
    store.items = store.items.map(repo =>
        repo.id === item.id ? { ...repo, ...item } : repo
    );
    let repo = store.items.find(repo => repo.id === item.id);
    if (!repo) {
        store.items.push(item);
    }
}

export abstract class WordStore<T extends WordData> {
    items = $state<T[]>([]);
    abstract type: WordType;

    abstract _delPost(word: T): Promise<void>;
    abstract _renamePost(word: T): Promise<void>;

    async reinit() { // 从项目库中加载--每次打开项目都会调用一次！
        this.items = await projectBase.vocabdb.getAllByType(this.type);
    }

    update(item: T) {
        updateStore(this, item);
    }

    async updateName(id: string, newWord: string): Promise<boolean> {
        const word = this.items.find(i => i.id === id);
        if (!word) {
            return false;
        }
        if (word.word === newWord) {
            return true;
        }
        word.word = newWord;
        updateStore(this, word);
        // 开始修改view的word!!

        const viewId = getViewId(id, this.type);
        const tabIdx = viewStore.tabs.findIndex(tab => tab.id === viewId);
        if (tabIdx >= 0) {
            const viewDef = {
                id: viewId,
                label: `${word.word}`,
                closable: true,
                type: viewTypeFromWord(word.type)
            };
            // 更新word.word
            viewStore.addView(viewDef);
        }
        const result = await projectBase.vocabdb.upsert(word);
        if (result) {
            await this._renamePost(word);
        }
        return !!result;
    }

    async delete(id: string): Promise<boolean> {
        const word = this.items.find(i => i.id === id);
        if (!word) {
            return false;
        }
        this.items = this.items.filter(i => i.id !== id);
        const result = await projectBase.vocabdb.remove(id);
        if (result) {
            await this._delPost(word);
        }
        return result;
    }
}