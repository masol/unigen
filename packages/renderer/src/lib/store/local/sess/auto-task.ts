// packages/renderer/src/lib/store/local/sess/auto-task.ts
//
// 「自动任务」对话框调度器。
//
// 设计目标：
//   - 将 store 中的对话框打开逻辑外置，保持 session.store 精简；
//   - 三类自动任务（completion / schedule / condition）各自独立对话框，
//     通过 kind 参数分离，避免单一巨型对话框；
//   - 对外统一入口 showAutoTaskDialog(kind, initialConfig)，
//     返回 null 表示用户取消（不写库）。
import { dialogStore } from "$lib/store/ui/dialog.svelte";
import AutoCompletionDialog from "./auto-completion.dialog.svelte";
import AutoConditionDialog from "./auto-condition.dialog.svelte";
import AutoScheduleDialog from "./auto-schedule.dialog.svelte";
import type { AutoTaskConfig } from "./session.types";

export type AutoTaskKind = "completion" | "schedule" | "condition";

/**
 * 打开指定类型的自动任务对话框。
 *
 * 返回值语义：
 *   - 用户保存 → 返回新的 AutoTaskConfig（含其它未修改字段）；
 *   - 用户取消 → 返回 null。
 */
export async function showAutoTaskDialog(
    kind: AutoTaskKind,
    initialConfig: AutoTaskConfig,
): Promise<AutoTaskConfig | null> {
    const props = { initialConfig };

    switch (kind) {
        case "completion":
            return dialogStore.safeShow(AutoCompletionDialog, props);
        case "schedule":
            return dialogStore.safeShow(AutoScheduleDialog, props);
        case "condition":
            return dialogStore.safeShow(AutoConditionDialog, props);
    }
}