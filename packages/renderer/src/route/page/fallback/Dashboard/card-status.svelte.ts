// src/lib/components/dashboard/card-status.svelte.ts
import type { CardStatus } from "$lib/store/ui/activity/info-card";

/**
 * 卡片状态解析器（内部计算，禁止外部注入）。
 *
 * 依据卡片 id 返回右上角状态徽章。此处留空由业务实现：
 *   - 读取 projectStore / 各业务 store，判定 ready / pending。
 *   - 返回 undefined 表示该卡片不显示状态徽章。
 *
 * 建议用 $derived 保持响应式；这里给出占位实现。
 */
export function resolveCardStatus(id: string): CardStatus | undefined {
    // TODO: 由你实现。示例骨架：
    // switch (id) {
    //   case "input-manager": {
    //     const ready = /* 读 store 判定 */ false;
    //     return { label: ready ? "已就绪" : "待输入", tone: ready ? "ready" : "pending" };
    //   }
    //   ...
    // }
    void id;
    return undefined;
}