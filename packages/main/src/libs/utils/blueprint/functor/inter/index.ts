import { BaseFunctor } from "../base.js";
import { SplitFunctor } from "./split.js";


export function getAllInternal(): BaseFunctor[] {
    return [
        new SplitFunctor()
    ]
}