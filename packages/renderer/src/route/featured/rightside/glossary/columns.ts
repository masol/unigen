// $lib/components/glossary/glossary-columns.ts
import { renderComponent } from "$lib/components/ui/data-table/index.js";
import type { ColumnDef } from "@tanstack/table-core";
import GlossaryNameCell from "./name-cell.svelte";
import GlossaryRowActions from "./row-actions.svelte";
import type { BlueprintTerm } from "./store.svelte.js";
import GlossaryTimeCell from "./time-cell.svelte";

export const glossaryColumns: ColumnDef<BlueprintTerm>[] = [
    {
        id: "actions",
        enableHiding: false,
        meta: { class: "w-10" },
        cell: ({ row }) =>
            renderComponent(GlossaryRowActions, { term: row.original }),
    },
    {
        accessorKey: "name",
        header: "名称",
        // 名称列自适应剩余空间；min-w-0 允许 truncate 生效
        meta: { class: "w-full" },   // 名称列吃掉全部剩余宽度
        cell: ({ row }) =>
            renderComponent(GlossaryNameCell, { name: row.original.name }),
    },
    {
        accessorKey: "updatedAt",
        header: "更新时间",
        // 时间字符串（fromNow）有最大长度，固定较窄宽度、不换行
        meta: { class: "w-24 text-end" },
        cell: ({ row }) =>
            renderComponent(GlossaryTimeCell, { value: row.original.updatedAt }),
    },

];