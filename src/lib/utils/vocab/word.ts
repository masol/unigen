import type { WordData } from "./type";

export abstract class Word {
    protected abstract get data(): WordData;
    hasConcept() {
        return this.data.concept_id !== 0;
    }
}
