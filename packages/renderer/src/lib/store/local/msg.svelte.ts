// packages/renderer/src/lib/store/local/msg.svelte.ts
//
// msg store 拆分说明（详见 msg/ 子目录）：
//   - types.ts    —— 对外 SelectedItem，以及内部 RunState / StreamSideEffects
//   - helpers.ts  —— 无状态的 message / trace 遍历工具
//   - recovery.ts —— reload 时根据会话状态（running / idle）选择的消息修复策略
//   - stream.ts   —— ChatStreamEvent 到 ChatMessage[] 的纯函数应用
//   - auto.ts     —— 自动续写的纯逻辑（追加提示词、思考/正文比较、完成标记检查）
//
// 本文件只保留 store 的「有状态」部分（响应式字段、生命周期、CRUD、run），
// 以控制单文件行数；对外 API 与重构前完全一致。
import { projectStore } from "$lib/store/project.svelte";
import { safeApi } from "$lib/utils/api";
import evtbus from "$lib/utils/evtbus";
import { hooks } from "$lib/utils/hook";
import { truncate } from '$lib/utils/str';
import type { BuiltinTool } from "@app/main/types";
import log from 'electron-log/renderer';
import Logger from "electron-log/renderer.js";
import pTimeout, { TimeoutError } from "p-timeout";
import { toast } from "svelte-sonner";

import type { ChatMessage, ChatStreamEvent } from "./chat.types";
import {
    appendPassivePrompt,
    buildAutoRuntime,
    decideAutoContinue,
    shouldAppendFirstUserContent,
} from "./msg/auto";
import {
    createDeferred,
    findMessageIn,
    findPairBoundary,
    forceEndTraces,
    newId,
} from "./msg/helpers";
import {
    repairIdleMessages,
    restoreRunningMessages,
} from "./msg/recovery";
import { applyStreamEvent } from "./msg/stream";
import type {
    RunState,
    SelectedItem,
    StreamSideEffects,
} from "./msg/types";
import { readAutoTaskConfig } from "./sess/session.types";
import { sessionStore } from "./session.store.svelte";

export type { BuiltinTool } from "@app/main/types";
export type { SelectedItem } from "./msg/types";

const RUNCOMMAND_END_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 1 day
const SELECTED_TOOLS_KEY = "selected_tools";
const SELECTED_SKILLS_KEY = "selected_skills";

const streamSide: StreamSideEffects = {
    bumpMessageCount: (delta, sid) => sessionStore.updMessageCount(delta, sid),
};

class MessageStore {
    constructor() {
        evtbus.on("runcommand-end", ({ suc, seq }) => {
            const state = this.#runsBySeq.get(seq);
            if (state) {
                this.#runsBySeq.delete(seq);
                state.deferred.resolve(suc);
            } else {
                Logger.debug("runcommand-end received with no pending waiter", {
                    suc,
                    seq,
                });
            }
        });
        evtbus.on("switch-session", ({ state }) => {
            if (state === "start") {
                this.isReloading = true;
            } else if (state == "failed") {
                this.isReloading = false;
            }
        });
        hooks.hook("session:changed", async () => {
            //active session变化了，开始加载其message list.
            await this.reload();
            this.#syncRunStateForActive();
        });
        hooks.hook("project:loaded", async () => {
            // 项目成功打开、存储已就绪后，恢复该项目下输入栏的已选工具/技能。
            await this.#loadSelectedFromProject();
        });
        hooks.hook("project:closed", async () => {
            // 项目关闭：清理输入栏中的已选工具与技能。
            //
            // 注意：切换 session **不再清理** selectedTools/selectedSkills
            // （见 reload() 的变更说明），只有关闭项目才清理。
            // 已选项是「跨会话的输入意图」，切会话不应打断用户的编辑上下文。
            //
            // 这里只清空内存。项目级存储保留用户上次选择，
            // 下次 project:loaded 时会恢复；用户主动清空时已即时持久化空数组。
            this.selectedTools = [];
            this.selectedSkills = [];
        });
    }

    // ── Public reactive state ───────────────────────────────────
    messages = $state<ChatMessage[]>([]);
    isLoading = $state(false);
    isAborting = $state(false);

    /** 消息列表同步加载中：与 AI 运行中的 isLoading 分开，避免 BlockUI 误伤流式回答 */
    isReloading = $state(true);

    /**
     * 全局删除/清理操作进行中。
     * 用于在删除、清空、编辑后重跑等异步操作期间禁用输入发送，避免状态竞争。
     */
    isDeleting = $state(false);

    /** 每条消息的「删除中」状态：用于单条消息按钮显示转圈 */
    deletingMessages = $state<Record<string, boolean>>({});

    collapsedMessages = $state<Record<string, boolean>>({});

    /**
     * 全局思考信息（trace）显示开关。
     * 由 WorkbenchHeader 统一控制全部消息的 trace 显隐，
     * AssistantMessage 通过读取该字段决定是否渲染 AgentTrace。
     */
    tracesVisible = $state(true);

    /**
     * 输入栏已选工具（内建 + 检索结果，可混选）。
     * 只保留最小信息：id（服务端唯一需要）与 name（已选区展示）。
     * description 等仅搜索结果列表需要的字段不进入已选项，也不做项目级持久化。
     *
     * 生命周期：**跨 session 保留**；项目打开时从项目级存储读取，
     * PickerMenu 变更时异步写回；仅在「关闭项目」时清空内存。
     */
    selectedTools = $state<SelectedItem[]>([]);

    /**
     * 输入栏已选技能。
     * 只保留最小信息：id（服务端唯一需要）与 name（已选区展示）。
     * description 等仅搜索结果列表需要的字段不进入已选项，也不做项目级持久化。
     *
     * 生命周期：**跨 session 保留**；项目打开时从项目级存储读取，
     * PickerMenu 变更时异步写回；仅在「关闭项目」时清空内存。
     */
    selectedSkills = $state<SelectedItem[]>([]);

    /** 内建工具列表；系统启动后由 init 通过主进程 API 初始化 */
    builtinTools = $state<BuiltinTool[]>([]);

    hasMessages = $derived(this.messages.length > 0);
    lastMessage = $derived(
        this.messages.length > 0
            ? this.messages[this.messages.length - 1]
            : null,
    );

    // ── Internals ───────────────────────────────────────────────
    #nextSeq = 1;

    /**
     * 一次 run 的全部内部状态都收敛到 RunState 中：
     * - 按 sessionId 查找：用于会话级锁定、abort、切换会话时恢复 UI 状态；
     * - 按 seq 查找：用于承接主进程 runcommand-end 确认事件。
     */
    #runsBySession = new Map<string, RunState>();
    #runsBySeq = new Map<number, RunState>();

    /**
     * 系统启动时调用，用于初始化内建工具列表。
     *
     * 防御说明：safeApi() 在业务错误 / 路由未就绪等场景下可能返回 null
     * （参见 installSkill 中的相同防御），此处必须显式判空，否则会在
     * `result.tools` 上抛 TypeError 并打断 App 启动流程。
     * 初始化失败时不阻断应用启动，内建工具列表保持为空；调用方可后续重试。
     */
    async init(): Promise<void> {
        try {
            const result = await safeApi().agent.loadBuildin();
            if (!result) {
                Logger.error(
                    "[MessageStore] init builtin tools: loadBuildin 返回空结果（API 层可能尚未就绪或业务失败）",
                );
                return;
            }
            this.builtinTools = result.tools;
        } catch (err) {
            Logger.error("[MessageStore] init builtin tools failed", err);
        }
    }

    async #loadSelectedFromProject(): Promise<void> {
        // 新项目打开时先清空，避免读取失败时把上一个项目的已选项带入新项目。
        this.selectedTools = [];
        this.selectedSkills = [];

        try {
            const [tools, skills] = await Promise.all([
                safeApi().project.get(SELECTED_TOOLS_KEY),
                safeApi().project.get(SELECTED_SKILLS_KEY),
            ]);
            this.selectedTools = this.#parseSelectedItems(tools);
            this.selectedSkills = this.#parseSelectedItems(skills);
        } catch (err) {
            Logger.error(
                "[MessageStore] load selected tools/skills failed",
                err,
            );
        }
    }

    #parseSelectedItems(value: unknown): SelectedItem[] {
        if (!Array.isArray(value)) return [];

        const result: SelectedItem[] = [];
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        const seen = new Set<string>();

        for (const raw of value) {
            if (!raw || typeof raw !== "object") continue;
            const id = (raw as { id?: unknown }).id;
            if (typeof id !== "string" || !id || seen.has(id)) continue;

            const rawName = (raw as { name?: unknown }).name;
            const name =
                typeof rawName === "string" && rawName.trim()
                    ? rawName
                    : id;

            result.push({ id, name });
            seen.add(id);
        }

        return result;
    }

    /**
     * 将输入栏已选项写入项目级存储。
     *
     * - 不 await：持久化失败不阻塞/打断用户操作；
     * - 只写最小投影 { id, name }，避免 description 等仅搜索结果使用的字段膨胀项目存储；
     * - 项目未打开时跳过，防止 project:closed 后的空数组覆盖存储。
     */
    persistSelected(kind: "tools" | "skills", items: SelectedItem[]): void {
        if (!projectStore.opened) return;

        const key =
            kind === "tools" ? SELECTED_TOOLS_KEY : SELECTED_SKILLS_KEY;
        const payload: Array<Record<string, string>> = items.map((it) => ({
            id: it.id,
            name: it.name,
        }));

        try {
            void Promise.resolve(
                safeApi().project.set({ key, value: payload }),
            ).catch((err: unknown) => {
                Logger.error(
                    "[MessageStore] persist selected items failed",
                    { key, err },
                );
            });
        } catch (err) {
            Logger.error(
                "[MessageStore] persist selected items failed synchronously",
                { key, err },
            );
        }
    }

    /**
     * 加载当前会话的消息列表。
     *
     * 恢复策略按「会话是否正在运行」分支：
     * - 未运行：recovery#repairIdleMessages（静止态收尾）；
     * - 运行中：recovery#restoreRunningMessages（保留活跃流，合并内存快照）。
     *
     * 运行判定：以「内存 RunState 是否存在」为唯一权威依据。
     *
     * 注意事项：
     * - 本方法**不再清空** selectedTools / selectedSkills。它们的生命周期与
     *   session 无关，只在「关闭项目」时清空（见 constructor 中的
     *   `project:closed` hook）。切换 session 保留输入意图。
     */
    private async reload(): Promise<void> {
        const sid = sessionStore.activeSessionId
        const runState = sid ? this.#runsBySession.get(sid) : undefined
        const running = runState !== undefined

        // 内存快照：只信任 RunState.messages —— 它是该 session 在本次 run 中的
        // 完整消息集合。this.messages 在下方的 `this.messages = []` 后已清空，
        // 从它过滤没有意义。
        let liveSnapshot: ChatMessage[] = []
        if (runState?.messages && runState.messages.length > 0) {
            liveSnapshot = runState.messages
        }

        this.messages = []
        log.debug('[MessageStore] reload() called', {
            sid,
            running,
            liveSnapshot: liveSnapshot.length,
        })
        this.isReloading = true

        try {
            const loaded = await safeApi().project.listMessage({
                sessionId: sid,
                withTraces: true,
            })
            this.messages = running
                ? restoreRunningMessages(loaded, runState, liveSnapshot)
                : repairIdleMessages(loaded)
            // 重新绑定快照引用：让活跃态的流事件再次自然作用于 this.messages。
            // 老的 liveSnapshot 数组引用此时不再需要，交由 GC。
            if (runState) {
                runState.messages = this.messages
                if (runState.auto) {
                    runState.auto.messages = this.messages
                }
            }
            log.info(
                `[MessageStore] reload completed, loaded ${this.messages.length} messages, running=${running}`,
            )
        } catch (err) {
            const errMessage = err instanceof Error ? err.message : String(err);
            toast.error(errMessage);
            log.error('[MessageStore] reload() failed', err)
        } finally {
            this.isReloading = false
        }
    }

    // ── Message CRUD ────────────────────────────────────────────
    addMessage(partial: Omit<ChatMessage, "id" | "timestamp" | "sessionId">): ChatMessage {
        const msg: ChatMessage = {
            sessionId: sessionStore.activeSessionId ?? "error",
            id: newId(),
            timestamp: Date.now(),
            ...partial,
        };

        this.messages = [...this.messages, msg];
        sessionStore.updMessageCount();
        return msg;
    }

    /**
     * 清空当前会话的全部消息。
     * - 先调用 deleteMessagesAfter(fromTs = 0) 让后端清空；
     * - 成功后本地消息、折叠状态、活动助手 id 一并重置；
     * - 失败时保留本地状态，并提示用户。
     */
    async clear(): Promise<void> {
        if (this.isDeleting || this.isLoading || this.isReloading) return;

        const sid = sessionStore.activeSessionId;
        if (!sid) {
            // 没有活跃 session 时直接清空本地状态
            this.messages = [];
            this.collapsedMessages = {};
            return;
        }

        this.isDeleting = true;
        try {
            await safeApi().project.deleteMessagesAfter({ sid, fromTs: 0 });
            this.messages = [];
            this.collapsedMessages = {};
            // 同步清空 RunState 中的快照，防止切回时被内存数据还原
            const state = this.#runsBySession.get(sid);
            if (state) state.messages = null;
        } catch (err) {
            const errText = err instanceof Error ? err.message : String(err);
            toast.error(`清空会话失败：${errText}`);
            Logger.error("[MessageStore] clear() failed", err);
        } finally {
            this.isDeleting = false;
        }
    }

    /**
     * 删除单条消息，并按配对规则同时删除其配对消息：
     * - 删除用户消息：连带删除紧随其后的助手消息（直到下一个用户消息之前）；
     * - 删除助手消息：连带删除其提示用户消息，以及该用户消息之后的所有助手消息。
     *
     * 删除按条逐个进行，每条成功后立即更新本地状态，使部分失败时的 UI 与后端一致。
     */
    async deleteMessage(id: string): Promise<void> {
        if (this.isDeleting || this.isLoading || this.isReloading) {
            toast.error("当前有其他操作正在进行，请稍后");
            return;
        }

        const idx = this.messages.findIndex((m) => m.id === id);
        if (idx < 0) return;

        const { start, end } = findPairBoundary(this.messages, idx);
        const targets = this.messages.slice(start, end + 1);
        const ids = targets.map((m) => m.id);

        ids.forEach((mid) => { this.deletingMessages[mid] = true; });
        this.isDeleting = true;

        try {
            for (const mid of ids) {
                await safeApi().project.deleteMessage(mid);
                // 单条成功后立即从本地状态移除，保证部分失败时前后端一致
                this.messages = this.messages.filter((m) => m.id !== mid);
                delete this.collapsedMessages[mid];
                delete this.deletingMessages[mid];
            }
        } catch (err) {
            const errText = err instanceof Error ? err.message : String(err);
            toast.error(`删除失败：${errText}`);
            Logger.error("[MessageStore] deleteMessage() failed", { id, err });
        } finally {
            // 兜底清空转圈状态
            ids.forEach((mid) => { delete this.deletingMessages[mid]; });
            this.isDeleting = false;
        }
    }

    /**
     * 从指定用户消息处重新执行：
     * - 先 deleteMessagesAfter 删除该消息及其后所有消息（fromTs = target.timestamp - 1，
     *   假设 deleteMessagesAfter 语义为严格大于）；
     * - 再以原内容或编辑后的新内容重新创建一条用户消息；
     * - 最后走正常 AIResponse 流程。
     *
     * 用于「重新运行」与「编辑并重新运行」两个入口。
     */
    async resendFrom(messageId: string, newContent?: string): Promise<void> {
        if (this.isDeleting || this.isLoading || this.isReloading) {
            toast.error("当前有其他操作正在进行，请稍后");
            return;
        }
        if (!projectStore.opened) {
            toast.error("请先打开一个项目");
            return;
        }

        const idx = this.messages.findIndex((m) => m.id === messageId);
        if (idx < 0) return;
        const target = this.messages[idx];
        if (target.role !== "user") {
            toast.warning("只能从用户消息重新运行");
            return;
        }

        const sid = sessionStore.activeSessionId;
        if (!sid) return;

        // 假设 deleteMessagesAfter 语义为严格大于 → 用 timestamp - 1 一并删除目标消息本身
        const fromTs = target.timestamp - 1;

        this.isDeleting = true;
        try {
            await safeApi().project.deleteMessagesAfter({ sid, fromTs });
            // 本地同步裁剪（丢弃目标消息及其后所有消息）
            this.messages = this.messages.slice(0, idx);
        } catch (err) {
            const errText = err instanceof Error ? err.message : String(err);
            toast.error(`重新运行前的删除失败：${errText}`);
            Logger.error("[MessageStore] resendFrom() delete failed", err);
            return; // finally 会清理状态
        } finally {
            this.isDeleting = false;
        }

        // 重建用户消息并走正常流程（files 从历史消息恢复）
        const userMsg = this.addMessage({
            role: "user",
            content: newContent ?? target.content,
            files: target.files ?? [],
        });

        await this.AIResponse(userMsg);
    }

    /**
     * 正式声明「重新生成」能力。
     * 当前尚未实现，先以 toast 提示占位，避免调用方通过
     * `messageStore as unknown as {...}` 做结构性探测。
     */
    async regenerate(messageId: string): Promise<void> {
        void messageId;
        toast.warning("重新生成功能尚未实现");
    }

    setLoading(loading: boolean) {
        this.isLoading = loading;
    }

    toggleMessage(messageId: string) {
        this.collapsedMessages[messageId] = !this.collapsedMessages[messageId];
    }

    toggleAllMessages() {
        if (this.messages.length === 0) return;
        const allCollapsed = this.messages.every(
            (m) => this.collapsedMessages[m.id] === true,
        );
        const target = !allCollapsed;
        this.messages.forEach((m) => {
            this.collapsedMessages[m.id] = target;
        });
    }

    toggleTracesVisible() {
        this.tracesVisible = !this.tracesVisible;
    }

    // ── Stream event entry ──────────────────────────────────────

    /**
     * 事件应用到当前活跃视图（this.messages）。
     * 保留公有 API 兼容 ChatInput / Workbench 等直接调用方。
     */
    handleStreamEvent(event: ChatStreamEvent, state?: RunState): void {
        applyStreamEvent(this.messages, event, state, streamSide);
    }

    #syncRunStateForActive(): void {
        const sid = sessionStore.activeSessionId;
        const state = sid ? this.#runsBySession.get(sid) : undefined;
        this.setLoading(Boolean(state));
        this.isAborting = state?.aborting ?? false;
    }

    // ── Run lifecycle ───────────────────────────────────────────
    async AIResponse(userMessage: ChatMessage, mode: string | null = null): Promise<void> {
        if (this.isDeleting) {
            toast.error("正在删除消息，请稍后");
            return;
        }
        if (this.isReloading) {
            toast.error("正在同步会话，请稍后");
            return;
        }
        if (!projectStore.opened) {
            toast.error("请先打开一个项目");
            return;
        }

        const sid = sessionStore.activeSessionId;
        if (!sid) {
            toast.error("请先选择会话");
            return;
        }

        if (this.#runsBySession.has(sid)) {
            toast.error("当前会话已有任务正在进行，请等待完成或先终止");
            return;
        }

        // 工具/技能唯一真源是 selectedTools/selectedSkills。
        // 启动本次 run 前快照一份，避免运行期间用户继续改动输入栏导致参数漂移。
        // 协议层仍只接收 id 数组，这里把完整对象映射为 id。
        const tools = this.selectedTools.map((t) => t.id);
        const skills = this.selectedSkills.map((s) => s.id);

        const session = sessionStore.sessions.find((s) => s.id === sid);
        const completion = readAutoTaskConfig(session?.extra).completion;
        const autoRuntime = buildAutoRuntime(
            completion,
            mode,
            tools,
            skills,
            this.messages,
        );

        const seq = this.#nextSeq++;
        const runState: RunState = {
            seq,
            sessionId: sid,
            controller: new AbortController(),
            promise: null,
            deferred: createDeferred(),
            activeAssistantId: null,
            aborting: false,
            // 关键：直接引用 this.messages。活跃态下双方同引用，
            // 流事件（applyStreamEvent 就地修改）会同时作用于 this.messages
            // 和 state.messages，无需任何双写同步。
            messages: this.messages,
            auto: autoRuntime,
            appendUserContent: shouldAppendFirstUserContent(autoRuntime),
            lastAssistantId: null,
        };

        this.#runsBySession.set(sid, runState);
        this.#runsBySeq.set(seq, runState);

        // 运行状态同步到 sessionStore：左侧会话条目据此展示 running 视觉
        sessionStore.setSessionRunning(sid, true);
        this.isAborting = false;
        this.setLoading(true);

        if (userMessage.content) {
            sessionStore.autoTitle(truncate(userMessage.content))
        }

        const run = this.#run(runState, userMessage, mode, tools, skills);
        runState.promise = run;
        try {
            await run;
        } finally {
            if (runState.promise === run) {
                runState.promise = null;
            }
        }
    }

    async #run(
        state: RunState,
        userMessage: ChatMessage,
        mode: string | null,
        tools: string[],
        skills: string[],
    ): Promise<void> {
        const { seq, sessionId } = state;
        const signal = state.controller.signal;
        let stream: AsyncGenerator<ChatStreamEvent> | null = null;

        try {
            Logger.debug("skills,tools:", skills, tools)
            const sendContent =
                state.appendUserContent && state.auto
                    ? appendPassivePrompt(userMessage.content, state.auto)
                    : userMessage.content;

            stream = (await safeApi().project.runCommand(
                {
                    msg: sendContent,
                    msgId: userMessage.id,
                    files: userMessage.files ?? [],
                    tools,
                    skills,
                    timestamp: userMessage.timestamp,
                    seq,
                    mode,
                    sessId: sessionId
                },
                { signal },
            )) as AsyncGenerator<ChatStreamEvent>;

            for await (const evt of stream) {
                if (signal.aborted) break;
                // 分发规则：
                // 1) 当前是活跃 session 且不在 reload 同步窗口 → 写 this.messages
                // 2) 后台（切走）或 reload 同步窗口 → 写 state.messages
                //    （reload 期间 this.messages 尚未被 loaded 替换，且可能是别的
                //     session 的数据；此窗口内一律走 state.messages 避免污染，
                //    reload 时再原子合并）
                if (
                    sessionStore.activeSessionId === sessionId &&
                    !this.isReloading
                ) {
                    applyStreamEvent(this.messages, evt, state, streamSide);
                } else if (state.messages) {
                    applyStreamEvent(state.messages, evt, state, streamSide);
                }
            }
        } catch (err) {
            if (signal.aborted) {
                Logger.info("runCommand aborted");
            } else {
                const errText =
                    err instanceof Error ? err.message : String(err);
                if (sessionStore.activeSessionId === sessionId) {
                    const errorContent = `处理失败：${errText}`;
                    if (
                        state.activeAssistantId &&
                        findMessageIn(this.messages, state.activeAssistantId)
                    ) {
                        applyStreamEvent(
                            this.messages,
                            {
                                type: "message.error",
                                messageId: state.activeAssistantId,
                                error: errorContent,
                            },
                            state,
                            streamSide,
                        );
                    } else {
                        state.activeAssistantId = null;
                        this.addMessage({
                            role: "assistant",
                            isError: true,
                            content: errorContent,
                        });
                    }
                } else {
                    // 后台失败：写入 state.messages 快照，切回时用户可看到
                    if (state.messages) {
                        const errorContent = `处理失败：${errText}`;
                        if (
                            state.activeAssistantId &&
                            findMessageIn(state.messages, state.activeAssistantId)
                        ) {
                            applyStreamEvent(
                                state.messages,
                                {
                                    type: "message.error",
                                    messageId: state.activeAssistantId,
                                    error: errorContent,
                                },
                                state,
                                streamSide,
                            );
                        }
                    }
                    Logger.error("runCommand failed in background session", {
                        sessionId,
                        err,
                    });
                }
            }
        } finally {
            if (stream && typeof stream.return === "function") {
                try {
                    await stream.return(undefined);
                } catch (returnErr) {
                    Logger.error(
                        "Failed to close run command stream safely:",
                        returnErr,
                    );
                }
            }

            await this.#waitForRunEnd(seq, state);

            // 收尾：对当前不在前台、但 state.activeAssistantId 仍存在的消息
            // 也要做终止态处理，避免切回时卡在 streaming。
            if (state.activeAssistantId) {
                const isActive = sessionStore.activeSessionId === sessionId;
                const targetMessages = isActive
                    ? this.messages
                    : (state.messages ?? []);
                const m = findMessageIn(targetMessages, state.activeAssistantId);
                if (m) {
                    m.streaming = false;
                    if (signal.aborted && m.content.length === 0) {
                        m.content = "您终止了当前任务,查看日志了解执行细节。";
                    }
                    forceEndTraces(m);
                }
            }

            const nextContent = this.#computeNextAutoContent(state);

            state.activeAssistantId = null;
            state.aborting = false;

            if (this.#runsBySession.get(sessionId) === state) {
                this.#runsBySession.delete(sessionId);
            }
            this.#runsBySeq.delete(seq);

            if (nextContent) {
                // 保持会话 running / loading，立即启动下一轮自动续写。
                this.#startAutoRound(state, nextContent);
            } else {
                // 运行状态清除：无论前台还是后台会话，都会走到这里，
                // 左侧列表条目据此恢复为非 running 视觉
                sessionStore.setSessionRunning(sessionId, false);

                if (sessionStore.activeSessionId === sessionId) {
                    this.#syncRunStateForActive();
                }
            }
        }
    }

    /**
     * 计算本轮结束后是否自动续写，以及下一轮要发送的用户内容。
     *
     * 使用 state.lastAssistantId 而非 activeAssistantId：后者在 message.end
     * 时已被清空。任何错误、终止或无助手消息的场景都直接停止。
     */
    #computeNextAutoContent(state: RunState): string | null {
        if (!state.auto || state.controller.signal.aborted) return null;

        const assistantId = state.lastAssistantId;
        if (!assistantId) return null;

        const messages = state.messages ?? [];
        const assistant = findMessageIn(messages, assistantId);
        if (!assistant) return null;

        return decideAutoContinue(state.auto, assistant);
    }

    /**
     * 启动下一轮自动续写。
     *
     * 这里同步创建新的 RunState 并立即启动 #run，避免在轮次之间出现
     * running/loading 状态空档。自动轮次使用首轮 tools/skills/mode 快照，
     * 且不再追加 passiveAppendPrompt。
     */
    #startAutoRound(prevState: RunState, content: string): void {
        const runtime = prevState.auto;
        const sid = prevState.sessionId;

        if (!runtime) {
            sessionStore.setSessionRunning(sid, false);
            if (sessionStore.activeSessionId === sid) {
                this.#syncRunStateForActive();
            }
            return;
        }

        const messages = prevState.messages ?? runtime.messages;
        runtime.messages = messages;

        const userMsg: ChatMessage = {
            id: newId(),
            sessionId: sid,
            role: "user",
            content,
            timestamp: Date.now(),
        };

        messages.push(userMsg);
        sessionStore.updMessageCount(1, sid);
        runtime.rounds += 1;

        const state: RunState = {
            seq: this.#nextSeq++,
            sessionId: sid,
            controller: new AbortController(),
            promise: null,
            deferred: createDeferred(),
            activeAssistantId: null,
            aborting: false,
            messages,
            auto: runtime,
            appendUserContent: false,
            lastAssistantId: null,
        };

        this.#runsBySession.set(sid, state);
        this.#runsBySeq.set(state.seq, state);
        sessionStore.setSessionRunning(sid, true);

        if (sessionStore.activeSessionId === sid) {
            this.isAborting = false;
            this.setLoading(true);
        }

        const run = this.#run(
            state,
            userMsg,
            runtime.mode,
            runtime.tools,
            runtime.skills,
        );
        state.promise = run;

        void run
            .finally(() => {
                if (state.promise === run) {
                    state.promise = null;
                }
            })
            .catch((err) => {
                Logger.error("[MessageStore] auto round failed", err);
                if (this.#runsBySession.get(sid) === state) {
                    this.#runsBySession.delete(sid);
                    this.#runsBySeq.delete(state.seq);
                    sessionStore.setSessionRunning(sid, false);
                    if (sessionStore.activeSessionId === sid) {
                        this.#syncRunStateForActive();
                    }
                }
            });
    }

    async #waitForRunEnd(seq: number, state: RunState): Promise<void> {
        try {
            const suc = await pTimeout(state.deferred.promise, {
                milliseconds: RUNCOMMAND_END_TIMEOUT_MS,
            });
            Logger.debug("runcommand-end confirmed", { seq, suc });
        } catch (err) {
            if (err instanceof TimeoutError) {
                this.#runsBySeq.delete(seq);
                Logger.error(
                    "Timed out waiting for runcommand-end confirmation",
                    { seq },
                );
                const msg =
                    "终止任务超时：未能确认主进程的任务已完全结束。为安全起见,请关闭全部窗口并重启应用。";
                if (sessionStore.activeSessionId === state.sessionId) {
                    this.addMessage({
                        role: "assistant",
                        isError: true,
                        content: msg,
                    });
                    toast.error(msg);
                } else {
                    Logger.error(
                        "Timed out waiting for runcommand-end in background session",
                        { seq, sessionId: state.sessionId },
                    );
                }
            } else {
                Logger.error(
                    "Unexpected error while waiting for runcommand-end",
                    err,
                );
            }
        }
    }

    async abort(): Promise<void> {
        const sid = sessionStore.activeSessionId;
        if (!sid) return;

        const state = this.#runsBySession.get(sid);
        if (!state?.promise) return;

        state.aborting = true;
        this.isAborting = true;
        state.controller.abort();
        await state.promise;
    }
}

const KEY = Symbol.for("unigen.renderer.messageStore");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const messageStore: MessageStore = ((globalThis as any)[KEY] ??=
    new MessageStore());