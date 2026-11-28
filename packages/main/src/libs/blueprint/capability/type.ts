import type { IRunnerContext } from "$types/blueprint/context.js";

/**
 * 一次 functor 运行的可选覆盖输入。
 *
 * 设计意图：
 *  - 宿主可能在同一个 ctx 上反复运行不同 functor（如 agent 通过 run_cap 调用子能力），
 *    此时不能直接改写 ctx.cmd / ctx.files（并发串味、dirty state 无法回收）；
 *  - 提供一个"仅本次运行生效"的视图，交由 scopeRunnerContext() 封装为作用域 ctx。
 *
 * 三个开关相互正交：
 *  - input / files 控制"数据"（cmd / files），由 scopeRunnerContext 封装；
 *  - isRoot 控制"执行语义"（写不写 message 表 / 会话历史），影响 PACFunctor 的 setRoot；
 *  - allowBodyFallback 控制"`_BI_input` 是否读 ctx.cmd.body"，只在 isRoot=false
 *    但希望 user_message 仍生效时使用。
 *
 * 语义：
 *  - undefined（或 input / files 都为 undefined）→ 作用域直接回退到 ctx，与旧版一致；
 *  - input 提供 → 由 resolveRunEnv 通过 parseCommandWithBody 解析为 CommandInfo，
 *    再覆盖到 ctx.cmd；
 *  - files 提供 → 覆盖 ctx.files；
 *  - isRoot 提供 → PACFunctor 在本次 run 中切换 root / sub-agent 语义；
 *  - allowBodyFallback 提供 → 覆盖 `_BI_input` 的 body 回退开关（默认取 isRoot）。
 */
export interface CapaRunInput {
    /**
     * 可选的用户输入文本，会覆盖 ctx.cmd。
     *
     * 解析规则（resolveRunEnv → parseCommandWithBody，与原用户输入完全一致）：
     *  - 普通文本 → `{ isCommand: false, body: "..." }`；
     *  - 首行以 `/` 开头 → `{ isCommand: true, command, args, body }`，
     *    args 进入目标 agent 的 inputs，body 进入作用域 ctx.cmd.body。
     *    命令名本身在本地 agent / 代码 / DAG 场景下会被忽略（executeAgent 只读
     *    cmd.body / cmd.args，不读 cmd.command）。
     */
    input?: string;
    /** 可选的附件路径列表，覆盖 ctx.files */
    files?: string[];
    /**
     * 可选的 root 语义开关。
     *
     *  - undefined：忽略，保持构造时默认（本地 agent 默认 true，即直连用户路径）；
     *  - true：以 root 身份运行（写 message 表、发 message.* 事件、读 PrjDB 历史）；
     *  - false：以 sub-agent 身份运行（不写 message 表、不发 message.* 事件、
     *          读 PacRunState 内存历史）。
     *
     * 注：仅 `PACFunctor` 消费该字段；代码 / DAG 能力忽略。
     */
    isRoot?: boolean;
    /**
     * 可选：显式覆盖 `_BI_input` 是否允许从 ctx.cmd.body 回退。
     *
     * 未提供时默认取 isRoot（root 读 body；sub-agent 只读 inputs 以避免幽灵上下文）。
     * 提供时以本字段为准：
     *  - true  → 即使 isRoot=false，也允许作用域 ctx.cmd.body 作为 `_BI_input` 的回退；
     *  - false → 即使 isRoot=true，也不读 ctx.cmd.body。
     *
     * 典型用途：run_cap 以 isRoot=false 运行（不写会话历史），又希望
     * user_message 进入 `_BI_input` —— 传 allowBodyFallback:true 即可。
     * 此时 body 来自 scopeRunnerContext 覆盖的 cmd（本轮 user_message），
     * 而非外层会话，不存在幽灵上下文问题。
     */
    allowBodyFallback?: boolean;
}

export interface ICapaFunctor {
    readonly id: string;
    /**
     * 执行能力并返回本次运行的"最终 message"。
     *
     * @param ctx 外层运行上下文
     * @param input 可选覆盖：input / files 覆盖数据；isRoot / allowBodyFallback 覆盖语义。
     *              未提供时完全沿用 ctx 与构造期默认（与旧版一致）。
     *
     * 约定：无可供调用方消费的文本时返回空字符串 ""，
     * 不使用 undefined / null 以免调用方增加额外的判空分支。
     */
    run(ctx: IRunnerContext, input?: CapaRunInput): Promise<string>;
}