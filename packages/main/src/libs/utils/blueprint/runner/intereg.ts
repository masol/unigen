import { BaseRunner } from "./base.js";
import { ICapaRunner } from "./type.js";


class InterReg {

    #intermap: Map<string, ICapaRunner> = new Map();

    has(name: string): boolean {
        return this.#intermap.has(name);
    }

    get(name: string): ICapaRunner | null {
        const ret = this.#intermap.get(name);
        return ret ? ret : null;
    }

    // 强制全体从baseRunner派生 -- inter也需要响应Input/output结构的动态变化。
    set(name: string, runner: BaseRunner) {
        this.#intermap.set(name, runner);
    }
}


export const intereg = new InterReg();