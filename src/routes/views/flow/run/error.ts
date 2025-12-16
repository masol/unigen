
export class RunError extends Error {
    isConnected: boolean;
    isolatedNodes: string[];
    constructor(msg: string, isConnected: boolean, isolatedNodes: string[]) {
        super(msg);
        this.isConnected = isConnected;
        this.isolatedNodes = isolatedNodes;
    }
}


export class NoReadyError extends Error {
    noreadyNodes: string[];
    constructor(msg: string, nodes: string[]) {
        super(msg);
        this.noreadyNodes = nodes;
    }
}
