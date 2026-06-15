import type { IProjectContext, IProjectController } from "../type.js";


export class PrjDB implements IProjectController {


    constructor(private ctx: IProjectContext) {
    }

    async init(): Promise<void> {
    }

    dispose(): void {

    }
}
