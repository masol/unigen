import { NodeEditor, type GetSchemes, ClassicPreset } from "rete";
import { sockets } from "./sockets";
import {
    SveltePlugin,
    Presets,
    type SvelteArea2D
} from "rete-svelte-plugin/5";


export class UniNode extends ClassicPreset.Node {
    width = 120;
    height = 180;
    constructor(label: string) {
        super(label);

        // this.addInput("exec", new ClassicPreset.Input(sockets().auto, "auto", true));
        // this.addOutput("exec", new ClassicPreset.Output(sockets().auto, "auto"));
    }


    execute(input: "auto", forward: (output: "auto") => void) {
        // console.log(this.message);
        forward("auto");
    }
}

export class Connection<N extends UniNode = UniNode> extends ClassicPreset.Connection<N, N> {

}


type Schemes = GetSchemes<UniNode, Connection<UniNode>>;
type AreaExtra = SvelteArea2D<Schemes>;
