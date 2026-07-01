import { getInternalName } from "$libs/utils/db/schema/capahelper2.js";
import { throwPrecondition } from "$libs/utils/err.js";
import type { Capability } from "$types/blueprint/capability.js";
import type { InterBase } from "./inter/base.js";
import { ICapaFunctor } from "./type.js";


class InterReg {

    // name to InterBase
    #intermap: Map<string, InterBase> = new Map();
    // id to InterBase
    #idmap: Map<string, InterBase> = new Map();

    constructor() {
    }

    has(name: string): boolean {
        return this.#intermap.has(name);
    }

    hasId(id: string): boolean {
        return this.#idmap.has(id);
    }

    // 通过名称获取capa的id.
    idByName(name: string): string | null {
        const capa = this.#intermap.get(name);
        return capa?.capa.id ?? null;
    }

    // 通过id获取capa。
    capaById(id: string): Capability | null {
        const ret = this.#idmap.get(id);
        return ret ? ret.capa : null;
    }

    get(name: string): ICapaFunctor | null {
        const ret = this.#intermap.get(name);
        return ret ? ret : null;
    }

    // 强制全体从baseRunner派生 -- inter也需要响应Input/output结构的动态变化。
    set(functor: InterBase): void {
        const interName = getInternalName(functor.capa);

        if (!interName || !functor.capa.id) {
            throwPrecondition(`capa id or name is empty, cannot register intereg: ${JSON.stringify(functor.capa)}`);
        }
        this.#intermap.set(interName, functor);
        this.#idmap.set(functor.capa.id, functor);
    }
}


export const intereg = new InterReg();