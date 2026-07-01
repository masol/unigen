import { BaseFunctor } from "./base.js";
import { ICapaFunctor } from "./type.js";


class InterReg {

    #intermap: Map<string, ICapaFunctor> = new Map();

    has(name: string): boolean {
        return this.#intermap.has(name);
    }

    get(name: string): ICapaFunctor | null {
        const ret = this.#intermap.get(name);
        return ret ? ret : null;
    }

    // 强制全体从baseRunner派生 -- inter也需要响应Input/output结构的动态变化。
    set(name: string, functor: BaseFunctor) {
        this.#intermap.set(name, functor);
    }
}


export const intereg = new InterReg();