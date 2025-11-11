import { ClassicPreset } from "rete";



export type ValidSockets = {
    "auto": ClassicPreset.Socket,
    "number": ClassicPreset.Socket,
    "text": ClassicPreset.Socket,
    "boolean": ClassicPreset.Socket
}

let socks: ValidSockets | null = null;


export function sockets(): ValidSockets {
    if (!socks) {
        socks = {
            "auto": new ClassicPreset.Socket("auto"),
            "number": new ClassicPreset.Socket("number"),
            "text": new ClassicPreset.Socket("text"),
            "boolean": new ClassicPreset.Socket("boolean"),
        }
    }
    return socks;
}


