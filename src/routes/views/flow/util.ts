import type { PortConfig } from "$lib/utils/appdb/rete.type";
import { trimTo6 } from "$lib/utils/str";
import type { FunctorData } from "$lib/utils/vocab/type";


export function cvtIO(functor: FunctorData): {
    inputs: PortConfig[],
    outputs: PortConfig[]
} {
    const inputs: PortConfig[] = [];
    const outputs: PortConfig[] = [];
    functor.extra?.inputs?.forEach((input) => {
        const cfg: PortConfig = {
            id: crypto.randomUUID(),
            key: input.name,
            label: trimTo6(input.name)
        };
        inputs.push(cfg);
    });

    if (functor.extra?.output) {
        const o = functor.extra.output;
        outputs.push({
            id: crypto.randomUUID(),
            key: o.name,
            label: trimTo6(o.name)
        });
    }

    return {
        inputs,
        outputs
    }

}
