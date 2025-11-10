import { type EntityData, type WordData } from "./type";
import { Word } from "./word";


export class Entity extends Word {
    #d: EntityData;

    protected get data(): WordData {
        return this.#d;
    }

    public constructor(data: EntityData) {
        super();
        this.#d = data;
    }
}
