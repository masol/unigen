/* eslint-disable @typescript-eslint/no-explicit-any */
// src/lib/components/dyn/registry.ts
import type { Component } from "svelte";

import AccordionSectionNode from "./nodes/AccordionSectionNode.svelte";
import ButtonGroupNode from "./nodes/ButtonGroupNode.svelte";
import FieldNode from "./nodes/FieldNode.svelte";
import ImageGridNode from "./nodes/ImageGridNode.svelte";
import PanelNode from "./nodes/PanelNode.svelte";
import SelectNode from "./nodes/SelectNode.svelte";
import TextListNode from "./nodes/TextListNode.svelte";

/** type → 组件。新增节点在此注册一行，dispatcher 不用动 */
export const NODE_REGISTRY: Record<string, Component<any>> = {
    panel: PanelNode,
    "accordion-section": AccordionSectionNode,
    "text-list": TextListNode,
    field: FieldNode,
    "image-grid": ImageGridNode,
    select: SelectNode,
    "button-group": ButtonGroupNode,
};

export function resolveNode(type: string): Component<any> | null {
    return NODE_REGISTRY[type] ?? null;
}