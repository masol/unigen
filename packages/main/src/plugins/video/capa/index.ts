import type { BaseFunctor } from "$libs/blueprint/capability/base.js";
import { SplitFunctor } from "./split.js";


export function getAllExtendInters(): BaseFunctor[] {
    return [
        new SplitFunctor()
    ]
}