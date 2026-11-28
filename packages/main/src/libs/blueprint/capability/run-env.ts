import { parseCommandWithBody } from "$libs/blueprint/cmd-parse.js";
import type { CommandInfo, IRunnerContext } from "$types/blueprint/context.js";
import Logger from "electron-log/main.js";
import { getErrorMessage } from "radashi";
import type { CapaRunInput } from "./type.js";

/**
 * 本次运行时真实生效的 cmd / files。
 */
export interface ResolvedRunEnv {
    cmd: CommandInfo;
    files: string[];
}

/**
 * 把用户输入的原始字符串解析为 CommandInfo。
 *
 * 走 parseCommandWithBody 是为了复用"首行可能承载命令与参数，其余行视为 body"
 * 的统一解析规则（例如本地 agent 通过 run_cap 传入 `/plan --foo bar\n正文`
 * 时，args 会进入目标 agent 的 inputs，body 进入 _BI_input）。
 *
 * shell-quote 对不匹配引号等边界输入会抛异常；此处回退为"整段视为 body"，
 * 避免把解析崩溃直接抛给 LLM 触发无意义重试。
 */
function parseUserInput(input: string): CommandInfo {
    try {
        return parseCommandWithBody(input);
    } catch (e) {
        Logger.warn(
            `[PAC] 解析 CapaRunInput.input 为 CommandInfo 失败,按原始文本处理:`,
            getErrorMessage(e),
        );
        return { isCommand: false, body: input };
    }
}

/**
 * 从可选覆盖输入解析出本次运行使用的 cmd / files。
 *
 * - input 为空（undefined 或两个字段都为 undefined）→ 完全回退到 ctx 原值；
 * - input.input 提供 → 通过 parseCommandWithBody 解析为 CommandInfo；
 * - input.files 提供 → 覆盖 ctx.files（做浅拷贝，防止外部数组被下游就地改写）。
 *
 * 注：解析 isRoot 不属于 resolveRunEnv 的职责——它只影响执行语义，
 * 不影响 cmd / files 内容；由 PACFunctor 自行消费。
 */
export function resolveRunEnv(
    ctx: IRunnerContext,
    input?: CapaRunInput,
): ResolvedRunEnv {
    const cmd: CommandInfo =
        input?.input !== undefined
            ? parseUserInput(input.input)
            : ctx.cmd;
    const files: string[] =
        input?.files !== undefined ? input.files.slice() : ctx.files;
    return { cmd, files };
}

/**
 * 把 ctx 包装为"本次运行的视图"，作用域结束时自动释放。
 *
 * 设计取舍：为什么用 Proxy 而不是在 ctx 上 push/pop 栈？
 *   1. 并发安全 —— 每个作用域是独立 Proxy，不共享可变状态；run_cap 可能在
 *      toolCallConcurrency 下并发调用，栈式改写会串味。
 *   2. 可嵌套 —— 内层 functor 再次 scope 时叠一层新 Proxy，
 *      内层结束自动回到外层视图，无需手工 pop。
 *   3. 语义局部化 —— 下游代码继续用 ctx.cmd / ctx.files 读取即可，
 *      不需要改造调用点（这也是"隐藏 ctx.cmd/files"不可行时的正确做法）。
 *
 * 实现细节：
 *   - 只拦截 cmd / files 两个属性；其余成员 get/set 均透传给原 ctx；
 *   - 非方法成员（含 getter）用 `Reflect.get(target, prop, target)` 求值，
 *     保证 getter 内 `this.#private` 仍指向原实例，规避 Proxy 与私有字段的不兼容；
 *   - 方法返回 `.bind(target)`，理由同上（如 RunnerContext 的 #varMap / #mode）。
 *     这些方法均不读取 this.cmd / this.files，绑定后行为与原 ctx 一致。
 *   - input 为空时**直接返回原 ctx**，为直连用户输入路径保持零开销、零行为差异。
 *
 * 未来若要给 RunnerContext 增加读取 cmd / files 的方法，请放在 Proxy 拦截
 * 之外（或显式读取 get 拦截后的视图），否则 scoped 场景下会读到外层原值。
 */
export function scopeRunnerContext(
    ctx: IRunnerContext,
    input?: CapaRunInput,
): IRunnerContext {
    if (!input || (input.input === undefined && input.files === undefined)) {
        return ctx;
    }

    const env = resolveRunEnv(ctx, input);
    let cmd = env.cmd;
    let files = env.files;

    return new Proxy(ctx, {
        get(target, prop) {
            if (prop === "cmd") return cmd;
            if (prop === "files") return files;
            const value = Reflect.get(target, prop, target);
            if (typeof value === "function") {
                return (value as (...args: unknown[]) => unknown).bind(target);
            }
            return value;
        },
        set(target, prop, value) {
            if (prop === "cmd") {
                cmd = value as CommandInfo;
                return true;
            }
            if (prop === "files") {
                files = value as string[];
                return true;
            }
            return Reflect.set(target, prop, value, target);
        },
    });
}