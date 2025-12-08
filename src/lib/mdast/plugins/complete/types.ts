import type { HtmlWithChildren } from "$lib/mdast/types";
import type { Parent, Root } from "mdast";


export type HtmlNodeInfo = {
    node: HtmlWithChildren;
    parent: Parent;
    index: number;
}

export type CompleteContxt = {
    htmlNodes: Array<HtmlNodeInfo>
    tree: Root
}