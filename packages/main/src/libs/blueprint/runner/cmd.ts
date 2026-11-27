// packages/main/src/libs/blueprint/runner/cmd.ts

import { PrjDB } from '$libs/project/controllers/drizzle/index.js';
import { ProjectDbKeys } from '$libs/utils/db/dbkeys.js';
import { throwNotfound, throwPrecondition } from '$libs/utils/err.js';
import { delay } from '$libs/utils/promise.js';
import type { CommandInfo, IRunnerContext } from '$types/blueprint/context.js';
import { SpanStatusCode } from '@opentelemetry/api';
import Logger from 'electron-log/main.js';
import { getErrorMessage } from 'radashi';
import { parse, ParseEntry } from 'shell-quote';
import yargsParser from 'yargs-parser';
import { BaseRunner, withSpan } from './base.js';
import { runCmd as doAIGC } from './commands/aigc/index.js';
import { runCmd as doExport } from './commands/export/runCmd.js';
import { runCmd as doKV } from './commands/kv.js';
import { runCmd as doPlan } from './commands/plan/index.js';
import { runCmd as doPreprism } from './commands/preprism.js';
import { runCmd as doPrism } from './commands/prism.js';
import { runCmd as doRun } from './commands/run.js';

/**
 * 安全地将 shell-quote 的每一项还原为字符串
 */
function stringifyToken(token: string | ParseEntry): string {
    if (typeof token === 'string') return token;
    if ('pattern' in token) return token.pattern;   // 处理 Glob 模式 (如 *.js)
    if ('op' in token) return token.op;             // 处理控制符 (如 |, &&)
    if ('comment' in token) return `#${token.comment}`; // 处理注释
    return '';
}

/**
 * 解析用户输入。
 *
 * 注意：
 * - 只有首行可能承载命令与参数，后续行一律视为 body。
 * - 该实现只对首行调用 shell-quote，避免 body 很长时被整段解析。
 * - 排除源码注释 //、/* 开头的内容，避免把源代码误判为命令。
 */
export function parseCommandWithBody(userInput: string): CommandInfo {
    const firstNonWhitespaceIndex = userInput.search(/\S/);
    if (firstNonWhitespaceIndex < 0) {
        return { isCommand: false, body: "" };
    }

    const commandMarker = userInput[firstNonWhitespaceIndex];
    const nextChar = userInput[firstNonWhitespaceIndex + 1];

    // 命令必须以 / 开头；但 // 和 /* 更可能是源码注释，不能当作命令。
    if (commandMarker !== '/' || nextChar === '/' || nextChar === '*') {
        return { isCommand: false, body: userInput.trim() };
    }

    const firstLineEndIndex = userInput.indexOf('\n', firstNonWhitespaceIndex);
    const firstLineRaw =
        firstLineEndIndex === -1
            ? userInput.slice(firstNonWhitespaceIndex)
            : userInput.slice(firstNonWhitespaceIndex, firstLineEndIndex);
    const restRaw =
        firstLineEndIndex === -1 ? '' : userInput.slice(firstLineEndIndex + 1);
    const hasFollowingBody = /\S/.test(restRaw);

    // 只解析首行。后续 body 保持原始文本，避免 shell-quote 处理大文本。
    const firstLine = firstLineRaw.trim();
    const tokens = parse(firstLine);

    // 3. 提取首位的命令，并安全地移除开头的斜杠 '/'
    const rawCommand = tokens.shift();
    if (!rawCommand) {
        return { isCommand: true, command: '', args: {}, body: restRaw.trim() };
    }
    const commandStr = stringifyToken(rawCommand);
    const command = commandStr.startsWith('/') ? commandStr.slice(1) : commandStr;

    // 4. 寻找参数的“终止边界”
    let bodyStartIndex = tokens.length;

    for (let i = 0; i < tokens.length; i++) {
        const tokenStr = stringifyToken(tokens[i]);
        const prevTokenStr = i > 0 ? stringifyToken(tokens[i - 1]) : '';

        // 首行最后一个 token 只有在“后面没有 body 行”时才可能作为 body 起点。
        // 否则它更可能是上一参数的取值，例如：/cmd --model gpt-4\n后续 body。
        const isFirstLineTrailingBodyCandidate =
            i === tokens.length - 1 && !hasFollowingBody;

        // 判定边界：如果碰到了不以 - 开头的长文本（包含换行，或者是普通文本）
        // 且它不像是紧跟在参数名（如 --model）之后的简单参数值，就判定为 body 的起点
        if (
            !tokenStr.startsWith('-') &&
            (tokenStr.includes('\n') ||
                tokenStr.length > 20 ||
                isFirstLineTrailingBodyCandidate ||
                !prevTokenStr.startsWith('-'))
        ) {
            bodyStartIndex = i;
            break;
        }
    }

    // 5. 切分出参数数组和 Body 数组
    const argsTokens = tokens.slice(0, bodyStartIndex);
    const bodyTokens = tokens.slice(bodyStartIndex);

    // 6. 转化参数为键值对对象
    const argsStrings = argsTokens.map(stringifyToken);
    const fullParsedArgs = yargsParser(argsStrings);

    // 💡 使用解构赋值剔除 '_' 属性，将剩余的参数存入 cleanArgs 中
    const { _, ...cleanArgs } = fullParsedArgs;

    // 7. 还原 body 文本。首行 body token 继续沿用原有 stringify 逻辑；
    // 后续行保持原始文本，避免大文本被 shell-quote 逐 token 解析。
    const bodyFromFirstLine = bodyTokens.map(stringifyToken).join(' ');
    const bodyWithFollowingLines = bodyFromFirstLine
        ? restRaw
            ? `${bodyFromFirstLine}\n${restRaw}`
            : bodyFromFirstLine
        : restRaw;
    const bodyText = bodyWithFollowingLines.trim();

    return {
        isCommand: true,
        command,
        args: cleanArgs,
        body: bodyText
    };
}

// 命令执行器。解析命令字符串并加以执行。
export class CmdRunner extends BaseRunner {
    // 运行时挂着的是"最近一次执行"的 Promise。用它做并发互斥；
    // isRunning / waitFinish 只关系"是否存在"和"等待完成"，不关心值。
    #running: Promise<string> | null = null;

    get isRunning(): boolean {
        return this.#running !== null;
    }

    async waitFinish(): Promise<void> {
        const running = this.#running;
        if (running) {
            await running.catch(() => undefined);
        }
    }

    /**
     * 默认对话入口。
     *
     * 原 execute 的 else 分支抽出到这里，供两个地方复用：
     * 1. 用户输入本来就不是命令；
     * 2. 用户输入疑似命令，但没有命中 entry_xxx。
     */
    private async runDefault(ctx: IRunnerContext): Promise<string> {
        const prjdb: PrjDB = PrjDB.ensure(ctx.prj);
        const capId = prjdb.get<string>(ProjectDbKeys.entry_common);
        if (!capId) {
            if (ctx.prj.agent) {
                return await this.runCap(ctx.prj.agent, ctx);
            }
            throwNotfound("版本错误？未发现Project的默认Agent.");
        }
        return await this.runCap(capId, ctx);
    }

    /**
     * 尝试执行 entry_xxx；未命中时回退到默认对话。
     *
     * 这样即使首行类似 // 的源码被误送入命令分遣，也不会因为 entry_// 不存在
     * 而直接抛 precondition；未知命令也会回退到默认对话。
     */
    private async runEntryOrFallback(ctx: IRunnerContext): Promise<string> {
        const kvKey4cap = `entry_${ctx.cmd.command ?? ''}`;
        const prjdb: PrjDB = PrjDB.ensure(ctx.prj);
        const capId = prjdb.get<string>(kvKey4cap);
        if (!capId) {
            return await this.runDefault(ctx);
        }
        return await this.runCap(capId, ctx);
    }

    /**
     * 分遣内部子命令。
     * 返回值约定：
     *   - `run` / `default`（入口 cap）：返回被调能力的最终 message；
     *   - 其他内部子命令（export / plan / prism / preprism / kv / aigc / test）：
     *     它们通过 notify/report 与用户交流，本层不透出 message，返回 ""。
     *     这样既保持既有通知通路不变，又为上层 flow.cmd 等调用者提供稳定语义。
     */
    private async dispatchCmds(ctx: IRunnerContext): Promise<string> {
        switch (ctx.cmd.command) {
            case 'export':
                await doExport(ctx);
                return "";
            case 'plan':
                await doPlan(ctx);
                return "";
            case 'prism':
                await doPrism(ctx);
                return "";
            case 'preprism':
                await doPreprism(ctx);
                return "";
            case 'run':
                return await doRun(ctx);
            case 'kv':
                await doKV(ctx);
                return "";
            case 'aigc':
                await doAIGC(ctx);
                return "";
            case 'test':
                await delay(10000, ctx.signal);
                return "";
            default:
                return await this.runEntryOrFallback(ctx);
        }
    }

    /**
     * 执行命令并返回其最终 message。
     * 无文本结果时返回 ""。
     */
    async run(userInput: string, ctx: IRunnerContext, args?: Record<string, unknown>): Promise<string> {
        if (this.#running) {
            throwPrecondition("CmdRunner 实例不支持并发执行多个命令，请为每个命令创建独立实例。");
        }

        const running = this.execute(userInput, ctx, args);
        this.#running = running;
        try {
            return await running;
        } finally {
            if (this.#running === running) {
                this.#running = null;
            }
        }
    }

    private async execute(userInput: string, ctx: IRunnerContext, args?: Record<string, unknown>): Promise<string> {
        const cmdInfo = parseCommandWithBody(userInput);
        ctx.cmd = cmdInfo;
        ctx.cmd.args = { ...ctx.cmd.args, ...args };

        return withSpan(`CmdRunner.run`, async (span) => {
            span.setAttribute("command.userInput", userInput);
            span.addEvent("task_started", { message: `开始分遣命令: ${ctx.cmd.command}` });
            try {
                if (cmdInfo.isCommand) {
                    return await this.dispatchCmds(ctx);
                }

                // 非命令输入完全不经过 dispatch，直接进入默认对话。
                return await this.runDefault(ctx);
            } catch (e) {
                span.addEvent("command_run_failed");
                const errMsg = getErrorMessage(e);
                span.setAttribute("command.errMessage", errMsg);
                Logger.error(`执行命令出错:`, errMsg);
                // 保持既有语义：错误仅记日志与 span，不向调用方抛出。返回空串。
                return "";
            } finally {
                span.setStatus({ code: SpanStatusCode.OK });
            }
        });
    }
}