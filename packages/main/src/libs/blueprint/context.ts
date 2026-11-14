import { PrjDB } from '$libs/project/controllers/drizzle/index.js';
import { IProjectContext } from '$libs/project/type.js';
import { ProjectDbKeys } from '$libs/utils/db/dbkeys.js';
import type { CmdMode, CommandInfo, IRunnerContext } from '$types/blueprint/context.js';
import { ResolvedSettings } from '$types/blueprint/settings.js';
import type { ChatStreamEvent, RunnerParam } from '$types/index.js';
import log from 'electron-log/main.js';
import { isEmpty, isPlainObject } from 'radashi';
import { loadFunctor } from './capability/index.js';
import { ICapaFunctor } from './capability/type.js';

let runSeq: number = -1;

export class RunnerContext implements IRunnerContext {
    readonly signal: AbortSignal;
    readonly prj: IProjectContext;
    readonly prjdb: PrjDB;
    readonly seq: number;
    readonly store: Record<string, unknown> = {};
    readonly files: string[];
    readonly msgId: string;
    readonly sessId: string;
    readonly timestamp: number;
    readonly settings: Partial<ResolvedSettings>;
    readonly skills: string[];
    readonly tools: string[];

    #varMap: Map<string, unknown> = new Map();
    #mode: CmdMode;

    get mode() {
        return this.#mode;
    }

    getVar(name: string): unknown | null {
        return this.#varMap.get(name);
    }
    setVar(name: string, value: unknown): void {
        this.#varMap.set(name, value);
    }

    clear() {
        // 防止循环递归引用，无法GC.
        this.#varMap.clear();
    }

    cmd: CommandInfo = { isCommand: false, body: "" };
    fnReport: ((evt: ChatStreamEvent) => void) | null = null;
    // #stack: Capability[] = [];

    private readonly abortController: AbortController | null = null;

    constructor(command: RunnerParam, prj: IProjectContext, signal?: AbortSignal | null, seq?: number) {
        this.files = command.files ?? [];
        this.msgId = command.msgId;
        this.sessId = command.sessId;
        this.#mode = (command.mode ?? null);
        this.timestamp = command.timestamp;
        if (isPlainObject(command.settings) && !isEmpty(command.settings)) {
            this.settings = command.settings
        } else {
            const prjdb = PrjDB.ensure(prj);
            this.settings = prjdb.get(ProjectDbKeys.chat_settings) ?? {}
        }
        // Logger.debug("chat settings=", JSON.stringify(this.settings, null, 2))
        this.tools = command.tools ?? [];
        this.skills = command.skills ?? [];

        this.seq = seq ? seq : runSeq--;
        this.prj = prj;
        this.prjdb = PrjDB.ensure(prj);

        // 初始化原生的 AbortController
        if (signal) {
            this.signal = signal;
        } else {
            this.abortController = new AbortController();
            this.signal = this.abortController.signal;
        }

        // 配置 electron-log 的作用域 (Scope)
        // 这样该工作流实例的所有日志都会自动带上 [workflow-id] 前缀，方便排查问题
        log.scope(`workflow-${this.prj.path}`);
    }

    setMode(mode: CmdMode): void {
        this.#mode = mode;
    }

    // ==========================================
    // 🚦 状态检查点
    // ==========================================

    /** 快照检查点：判断当前工作流是否已经被终止 */
    get isAborted(): boolean {
        return this.signal.aborted;
    }

    /**
     * 内部或外部触发取消的方法（配合宿主环境使用）
     */
    triggerAbort(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.warn(`Workflow execution was aborted.`);
        } else {
            this.warn(`Workflow execution want abort. but this runner controlled by outer.`);
        }
    }

    set(key: string, value: unknown): void {
        this.prjdb.set(key, value);
    }

    get<T>(key: string): T | null {
        return this.prjdb.get<T>(key);
    }

    remove(key: string): void {
        this.prjdb.remove(key);
    }

    loadFunctor(capaId: string): ICapaFunctor | null {
        return loadFunctor(this, capaId);
    }

    /**
     * 日志接口 (适配 electron-log) 
    // @deprecated
     * @param title 
     * @param detail 
     */
    notify(title: string, detail: string): void {
        // this.prj.notify("task_progess_report", `${title} : ${detail}`);
        log.silly(`${title} : ${detail}`);
    }

    report(evt: ChatStreamEvent): void {
        this.fnReport?.(evt);
    }

    info(message: string, ...args: unknown[]): void {
        log.info(message, ...args);
    }

    warn(message: string, ...args: unknown[]): void {
        log.warn(message, ...args);
    }

    error(message: string, ...args: unknown[]): void {
        log.error(message, ...args);
    }

    debug(message: string, ...args: unknown[]): void {
        log.debug(message, ...args);
    }
}
