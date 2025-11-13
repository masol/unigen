import { ClassicPreset } from "rete";


export class UniNode extends ClassicPreset.Node {
    // width = 120;
    // height = 180;
    get width(): number {
        return 120;
    }
    get height(): number {
        return 180;
    }

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
