import { localeStore } from "$lib/stores/config/ipc/i18n.svelte";


export type WordType = "entity" | "function" | "flow";
export const TypeEntity = "entity"
export const TypeFunction = "function"
export const TypeFlow = "flow"


export abstract class Word {
    id: string;
    concept_id: number;
    word: string;
    definition: string = "";
    lang: string; // 词汇定义时，使用的语言．
    abstract readonly type: WordType;

    constructor(text?: string, id?: string) {
        this.word = text ? text : "";
        this.id = id ? id : crypto.randomUUID();
        this.concept_id = 0;
        this.lang = localeStore.lang;
    }

    hasConcept() {
        return this.concept_id !== 0;
    }
}
