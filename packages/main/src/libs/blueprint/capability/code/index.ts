import { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import { LanceDB } from "$libs/project/controllers/lance/index.js";
import type { IRunnerContext } from "$types/blueprint/context.js";
import Logger from "electron-log/main.js";
import vm from "node:vm";
import { getErrorMessage } from "radashi";
import { BaseFunctor } from "../base.js";
import { Capability } from "../is.js";
import { scopeRunnerContext } from "../run-env.js";
import type { CapaRunInput } from "../type.js";
import { FIXED_PACKAGES } from "./fixedpkgs.js";
import { getGlossary } from "./glossary.js";
import { getLLMPkgs } from "./llm.js";

/**
 * 基于 vm 的可信代码运行环境。
 *
 * 设计要点：
 *  1. 构造时一次性把源码包装成「异步闭包 + with(ioc)」并预编译为 V8 Script，
 *     后续每次 run 只做纯函数执行，避免高频调用时重复编译。
 *  2. 通过 `with(ioc)` 让源码可以直接书写 `userService.xxx`，
 *     无需 `ioc.userService`，达到「ioc 作为 global」的效果。
 *  3. runInThisContext 与主进程共享原型链，instanceof / 私有方法均可正常使用。
 *  4. 通过 scopeRunnerContext 把 ctx 作用域化：若外部传入 CapaRunInput，
 *     用户代码读取 ctx.cmd / ctx.files 时得到的是本次运行的视图，
 *     而不是外层会话的原值；不传 input 时零开销、行为与旧版一致。
 */
export class VmCapaFunctor extends BaseFunctor {
    /** 预编译好的脚本（构造时编译一次，反复执行） */
    private readonly script: vm.Script;

    constructor(
        readonly capa: Capability
    ) {
        super(capa)
        const filename = `codecap-${capa.id}.vm.js`
        // 包装成一个接收 ioc 的 async 函数：
        // - async  => 支持源码内部直接 await
        // - with   => 把 ioc 的属性抬升为源码里的自由变量（直接访问）
        //   注意：with 在严格模式下不可用，这里不要写 "use strict"
        const wrappedCode = `(async function (__ioc__) {
  with (__ioc__) {
${capa.code}
  }
})`;

        this.script = new vm.Script(wrappedCode, { filename });
    }

    async doTask(ctx: IRunnerContext, input?: CapaRunInput): Promise<string> {
        // 作用域化 ctx：input 为空时返回原 ctx，保证直接用户输入路径零差异。
        const scopedCtx = scopeRunnerContext(ctx, input);

        // 1. 构造注入给源码的 ioc 对象（作为源码的“全局”作用域）
        const ioc: Record<string, unknown> = {
            ctx: scopedCtx,
            db: PrjDB.ensure(ctx.prj),
            lance: LanceDB.ensure(ctx.prj),
            cap: this.capa,
            glossary: getGlossary(scopedCtx),
            llm: getLLMPkgs(scopedCtx),
            ...FIXED_PACKAGES
        };

        // 2. 取出预编译的异步函数外壳（与主进程共享上下文）
        const asyncFn = this.script.runInThisContext() as (
            ioc: Record<string, unknown>,
        ) => Promise<unknown>;

        try {
            // 3. 注入 ioc 并等待单次执行完毕
            const ret = await asyncFn(ioc);
            // 约定：源码 return 一个字符串时视作本次运行的最终 message；
            // 其他类型（包含 undefined / 对象 / 数组）不再隐式序列化——
            // 避免用户无意 return 一个引用类型时改变既有行为。
            return typeof ret === "string" ? ret : "";
        } catch (e) {
            Logger.error(`代码节点${this.capa.id}执行时报错:${getErrorMessage(e)}`)
            throw e;
        }
    }
}