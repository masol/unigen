import llmDef from './llm.d.ts.txt?raw';
type ExtraLibDef = {
    name: string;
    content: string;
};

export function getExtraLib(): ExtraLibDef[] {
    return [{
        name: "llm",
        content: llmDef
    }];
}
