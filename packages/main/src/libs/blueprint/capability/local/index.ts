import type { IRunnerContext } from "$types/blueprint/context.js";
import Logger from "electron-log/main.js";
import { getErrorMessage } from "radashi";
import { ICapaFunctor } from "../type.js";
import { PacAgent } from "./agent.js";
import { compilePacAgent } from "./compiler.js";
import type { CompiledPacAgent } from "./type.js";

/**
 * PAC (Prompt-as-Code) 本地能力运行环境。
 *
 * 一份 markdown = 一个 agent:
 *   - front matter 声明 name / description / inputs / outputs(JSON Schema)/ tools / maxSteps
 *   - 正文是 Handlebars 系统提示词模板,支持三类变量:
 *       {{_BI_tool}}  工具目录(作用、参数、返回);未引用时自动追加到正文末尾
 *       {{_T_xxx}}    内部存储变量(运行期 loadStorageVars 提供)
 *       {{_F_xxx}}    front matter 变量
 *
 * tools:
 *   - { type: builtin, id: "builtin::search_tools" }
 *   - { type: search,  query: "抓取网页并转为 markdown", limit: 3 }
 *   - { type: agent,   path: "./sub/analyzer.md" }   # 相对当前文件
 *   - { type: agent,   path: "/common/reviewer.md" } # 相对 PAC 根目录
 *   - { type: mcp,     serverId: web, name: fetch }
 * inputs/outputs 自动成为其 Tool 的 inputSchema/outputSchema —— 形成递归结构。
 *
 * 编译期一次性构建整棵树(纯函数,与 ctx 无关);
 * 运行期按 ctx 物化 ToolSet,保证 abort / prj 语义向下传递。
 */
export class PACFunctor implements ICapaFunctor {
    private agent: PacAgent | null = null;

    constructor(readonly type: string) { }

    /**
     * 编译期:递归构建整棵 agent 树。
     * 失败只记录,不抛出 —— 交给 run 时统一处理,保持 compile 幂等无副作用。
     */
    async compile(ctx: IRunnerContext): Promise<void> {
        if (ctx.isAborted) return;
        try {
            const compiled = await compilePacAgent(this.type);
            this.agent = new PacAgent(compiled);
            ctx.debug(
                `[PAC] 编译完成 ${compiled.name}` +
                ` (工具 ${compiled.toolRefs.length}, 子agent ${countSub(compiled)})`,
            );
        } catch (e) {
            const msg = `[PAC] 编译失败(${this.type}): ${getErrorMessage(e)}`;
            Logger.error(msg, e);
            ctx.error(msg);
        }
    }

    /** 运行期:确保已编译,然后执行顶层 agent */
    async run(ctx: IRunnerContext): Promise<void> {
        if (ctx.isAborted) return;
        if (!this.agent) await this.compile(ctx);
        if (!this.agent) {
            ctx.error(`[PAC] agent 未就绪: ${this.type}`);
            return;
        }
        try {
            const result = await this.agent.run(ctx);
            ctx.debug(`[PAC] 运行结果(${this.type}):`, result);
        } catch (e) {
            const msg = `[PAC] 运行失败(${this.type}): ${getErrorMessage(e)}`;
            Logger.error(msg, e);
            ctx.error(msg);
        }
    }
}

function countSub(c: CompiledPacAgent): number {
    let n = 0;
    for (const r of c.toolRefs) if (r.agent) n += 1 + countSub(r.agent);
    return n;
}

/* ---------------- 对外导出 ---------------- */

export { buildAgentTool, PacAgent } from "./agent.js";
export { compilePacAgent, createCompileCache, resolvePacPath } from "./compiler.js";
export { loadExternalTools } from "./loader.js";
export { buildToolDoc, jsonSchemaToZod } from "./schema.js";
export { buildUserPrompt, renderSystemPrompt, scanTemplateVars } from "./template.js";
export type {
    CompileCache, CompiledPacAgent, IPacAgent, JsonValue,
    PacFrontMatter, PacToolConfig, ToolOrigin, ToolRef, VarBuckets
} from "./type.js";
export {
    BI_PREFIX, classifyVars, FM_PREFIX, loadStorageVars, resolveFrontMatterValue, resolveFrontMatterVars, STORAGE_PREFIX, TOOL_DOC_VAR
} from "./vars.js";

