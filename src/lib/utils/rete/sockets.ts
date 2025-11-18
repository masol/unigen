import { ClassicPreset } from "rete";
import type { PortConfig } from "../appdb/rete.type";



export type ValidSockets = {
    "auto": ClassicPreset.Socket,
    "number": ClassicPreset.Socket,
    "text": ClassicPreset.Socket,
    "boolean": ClassicPreset.Socket
}

let socks: ValidSockets | null = null;


export type Port = ClassicPreset.Port<ClassicPreset.Socket>;

export const STDOUT = 'stdout' as const;
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

function newPort<T extends ClassicPreset.Input<ClassicPreset.Socket> | ClassicPreset.Output<ClassicPreset.Socket>>(
    sockcfg: PortConfig,
    PortClass: new (socket: ClassicPreset.Socket, label?: string) => T
): T {
    let ret: T | undefined;

    switch (sockcfg.type) {
        case 'number':
            ret = new PortClass(sockets().number, sockcfg.label);
            break;
        case 'text':
            ret = new PortClass(sockets().text, sockcfg.label);
            break;
        case 'boolean':
            ret = new PortClass(sockets().boolean, sockcfg.label);
            break;
    }

    if (!ret) {
        ret = new PortClass(sockets().auto, sockcfg.label);
    }

    ret.id = sockcfg.id ? sockcfg.id : crypto.randomUUID();
    return ret;
}

//
export function loadInput(sockcfg: PortConfig): ClassicPreset.Input<ClassicPreset.Socket> {
    return newPort(sockcfg, ClassicPreset.Input);
}

export function loadOutput(sockcfg: PortConfig): ClassicPreset.Output<ClassicPreset.Socket> {
    return newPort(sockcfg, ClassicPreset.Output);
}


export function getSocket(key: string, sock: Port): PortConfig {
    const item: PortConfig = {
        id: sock.id,
        key,
        label: sock.label,
        type: sock.socket.name
    }
    return item;
}