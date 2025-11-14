import { TypeEntity, TypeFlow, TypeFunctor, type WordData, type WordType } from "$lib/utils/vocab/type";
import type { NavType } from "../navpanel/nav.svelte";
import type { ViewType } from "./view.svelte";


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

export function updateStore(store: { items: WordData[] }, item: WordData) {
    store.items = store.items.map(repo =>
        repo.id === item.id ? { ...repo, ...item } : repo
    );
    let repo = store.items.find(repo => repo.id === item.id);
    if (!repo) {
        store.items.push(item);
    }
}