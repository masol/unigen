import { ClassicPreset } from "rete";


export class UniNode extends ClassicPreset.Node {
    #fid: string = "";
    // width = 120;
    // height = 180;
    get fid(): string {
        return this.#fid;
    }

    set fid(fid: string) {
        this.#fid = fid;
    }

    get width(): number {
        return 120;
    }

    get height(): number {
        return 180;
    }

    constructor(label: string, opt?: Record<string, any>) {
        super(label);
        if (opt?.id) {
            this.id = opt.id;
        }
        
        if (opt?.fid) {
            this.fid = opt.fid;
            // console.log("set fid to", opt.fid)
        }

        // this.addInput("exec", new ClassicPreset.Input(sockets().auto, "auto", true));
        // this.addOutput("exec", new ClassicPreset.Output(sockets().auto, "auto"));
    }


    execute(input: "auto", forward: (output: "auto") => void) {
        // console.log(this.message);
        forward("auto");
    }
}
