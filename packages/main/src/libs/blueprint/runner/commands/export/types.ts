import { BlueprintKind } from "$types/index.js";


export interface ExportFlags {
    noEntry: boolean;
    noRes: boolean;
    noCap: boolean;
    noMetag: boolean;
}

export interface WriteJob {
    kind: BlueprintKind | 'entry' | 'res';
    /** absolute path of the file to write */
    filePath: string;
    /** content getter — deferred so IO happens inside pMap */
    load: () => string;
    /** optional secondary file (capa code) */
    codePath?: string;
    loadCode?: () => string;
}