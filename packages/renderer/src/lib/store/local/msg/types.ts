// packages/renderer/src/lib/store/local/msg/types.ts
//
// msg store 拆分后对外/内部共享的类型：
//   - SelectedItem 是对外类型，外部只关心 id/name；
//   - RunState 是单次 run 的全部状态，仅在 msg store 内部流转；
//   - AutoCompletionRuntime 是一次「手动请求 + 后续自动续写」链路的共享状态；
//   - StreamSideEffects 把 MessageStore 的副作用注入到纯函数 `applyStreamEvent`，
//     使流事件处理逻辑可不依赖 store 实例（更易测试，也避免循环引用 sessionStore）。
import type { ChatMessage, ChatStreamEvent, TraceNode } from "../chat.types";
import type { AutoCompletionConfig } from "../sess/session.types";

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

/**
 * 自动续写链路的共享运行时。
 *
 * 一次「用户手动发送」会创建该对象；后续每一轮自动续写复用同一对象，
 * 以保证：
 * - rounds 跨轮累加，严格受 maxRounds 限制；
 * - tools / skills / mode 使用首轮快照，避免运行期间输入栏变更导致参数漂移；
 * - messages 始终指向该会话在当前链路中的消息数组，切走/后台轮次仍可继续写入。
 */
export interface AutoCompletionRuntime {
    /** 已归一化的自动续写配置。enabled 为 false 时不会创建该运行时。 */
    config: AutoCompletionConfig;
    /** 归一化后的最大自动发送轮次（不包含用户首轮）。 */
    maxRounds: number;
    /** 已经自动发送的轮次。 */
    rounds: number;
    /** 首轮 run 使用的 mode，后续自动轮次沿用。 */
    mode: string | null;
    /** 首轮 run 的工具 id 快照。 */
    tools: string[];
    /** 首轮 run 的技能 id 快照。 */
    skills: string[];
    /** 自动续写链路共享的消息数组。 */
    messages: ChatMessage[];
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

    /** 本次 run 所属的自动续写链；未启用自动续写时为 null。 */
    auto: AutoCompletionRuntime | null;
    /** 本轮发送时是否要把 passiveAppendPrompt 追加到用户内容后方。 */
    appendUserContent: boolean;
    /** 本轮最后启动的助手消息 id，用于 run 结束后判断是否触发自动续写。 */
    lastAssistantId: string | null;
}

export interface StreamSideEffects {
    /** 消息计数变化时由 store 注入，避免纯函数直接依赖 sessionStore。 */
    bumpMessageCount: (delta: number, sessionId: string) => void;
}