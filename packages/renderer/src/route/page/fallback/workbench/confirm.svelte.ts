// src/lib/utils/confirm.svelte.ts
// 集中式确认对话框辅助函数。
// 各删除/重置入口统一在此发起用户确认，避免各处手写 title/message 文案。
import { confirmStore } from "$lib/store/ui/confirm.svelte";

/** 删除单条消息（及其配对消息）前的确认 */
export async function confirmDeleteMessage(): Promise<boolean> {
    return await confirmStore.request({
        title: "确认删除",
        message: "确定要删除此消息及其配对消息吗？此操作不可恢复。",
    });
}

/** 清空整个会话的全部消息前的确认 */
export async function confirmClearAll(): Promise<boolean> {
    return await confirmStore.request({
        title: "确认清空对话",
        message: "确定要清空当前会话的全部消息吗？此操作不可恢复。",
    });
}

/** 直接重新运行某条用户消息前的确认 */
export async function confirmRerun(): Promise<boolean> {
    return await confirmStore.request({
        title: "确认重新运行",
        message: "重新运行将清除此消息之后的全部消息并重新执行，此操作不可恢复。是否继续？",
    });
}