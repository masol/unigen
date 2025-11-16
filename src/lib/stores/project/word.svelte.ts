import { projectBase } from "$lib/utils/appdb/project";
import { type WordData, type WordType } from "$lib/utils/vocab/type";
import { t } from "../config/ipc/i18n.svelte";
import { viewStore } from "./view.svelte";


export function getViewId(id: string, type: WordType) {
    return `${type}::${id}`
}

export function updateStore<T extends WordData>(store: { items: T[] }, item: T) {
    store.items = store.items.map(repo =>
        repo.id === item.id ? { ...repo, ...item } : repo
    );
    const repo = store.items.find(repo => repo.id === item.id);
    if (!repo) {
        store.items.push(item);
    }
}

export function nextName(prefix: string): string {
    const nextId = projectBase.vocabdb.maxId + 1;
    return prefix + String(nextId);
}

export function addWord2View(word: WordData): Promise<boolean> | undefined {
    const viewId = getViewId(word.id, word.type);
    const viewDef = {
        id: viewId,
        label: `${word.word}`,
        closable: true,
        docId: word.id,
        type: word.type
    };
    return viewStore.addView(viewDef);
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

    // 返回word.id
    async newItem(name?: string): Promise<T> {

        if (!name) {
            name = nextName(t(this.type));
        }
        const wordId = await projectBase.vocabdb.upsert({ type: this.type, word: name });
        const word = await projectBase.vocabdb.getById<T>(wordId);
        if (!word) {
            throw new Error(`新建${this.type}时出错!`)
        }

        this.update(word);
        return word;
    }

    openView(id: string): Promise<boolean> | undefined {
        const word = this.items.find(item => item.id === id);
        if (word) {
            return addWord2View(word)
        }
    }

    async updateName(id: string, newWord: string): Promise<boolean> {
        const oldWord = this.items.find(i => i.id === id);
        if (!oldWord) {
            return false;
        }
        const word = { ...oldWord }
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
                docId: word.id,
                type: word.type
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