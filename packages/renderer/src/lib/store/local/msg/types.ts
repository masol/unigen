// packages/renderer/src/lib/store/local/msg/types.ts
//
// msg store 拆分后对外/内部共享的类型：
//   - SelectedItem 是对外类型，外部只关心 id/name；
//   - RunState 是单次 run 的全部状态，仅在 msg store 内部流转；
//   - StreamSideEffects 把 MessageStore 的副作用注入到纯函数 `applyStreamEvent`，
//     使流事件处理逻辑可不依赖 store 实例（更易测试，也避免循环引用 sessionStore）。
import type { ChatMessage, ChatStreamEvent, TraceNode } from "../chat.types";

export type { ChatMessage, ChatStreamEvent, TraceNode };

/**
 * 输入栏已选项（工具 / 技能通用）。
 *
 * 最小信息原则：
 * - 服务端最终只消费 id；
 * - name 仅用于已选区展示，避免菜单打开时二次请求补全；
 * - description 等仅搜索结果列表需要的字段不进入已选项，也不做项目级持久化。
 */
export type SelectedItem = {
    id: string;
    name: string;
};

export interface SeqDeferred {
    promise: Promise<boolean>;
    resolve: (suc: boolean) => void;
}

export interface RunState {
    seq: number;
    sessionId: string;
    controller: AbortController;
    promise: Promise<void> | null;
    deferred: SeqDeferred;
    activeAssistantId: string | null;
    aborting: boolean;
    /**
     * 本次 run 所属 session 的完整消息快照。
     *
     * 生命周期（重要）：
     * - AIResponse 启动时引用 this.messages（若为当前活跃 session，则与全局视图
     *   同引用，流事件只需写一次即可双写；无需额外同步）；
     * - 会话切走后，this.messages 被其它 session 的数据替换，但本字段仍保留
     *   该 session 的数组引用，后台流事件继续向其写入（不再污染 this.messages）；
     * - 切回（reload）时以本字段作为内存快照与 DB 结果合并，避免 DB 落盘落后
     *   窗口（流式中途落盘不完整）导致历史消息丢失；
     * - reload 恢复后重新指向新的 this.messages，生命周期闭环；
     * - run 结束（finally）后仍保留（不主动清空），供兜底诊断使用。
     */
    messages: ChatMessage[] | null;
}

export interface StreamSideEffects {
    /** 消息计数变化时由 store 注入，避免纯函数直接依赖 sessionStore。 */
    bumpMessageCount: (delta: number, sessionId: string) => void;
}