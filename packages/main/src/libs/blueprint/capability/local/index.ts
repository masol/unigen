import type { IRunnerContext } from "$types/blueprint/context.js";
import Logger from "electron-log/main.js";
import { getErrorMessage } from "radashi";
import { ICapaFunctor } from "../type.js";
import { PacAgent } from "./agent.js";
import { compilePacAgent } from "./compiler.js";
import type { CompiledPacAgent } from "./type.js";

type PacProject = IRunnerContext["prj"];

/**
 * PAC (Prompt-as-Code) 本地能力运行环境。
 *
 * 一份 markdown = 一个 agent:
 *   - front matter 声明 name / description / inputs / outputs(JSON Schema)/
 *     tools / maxSteps / userTemplate(内联) / userTemplatePath(外部文件) / setDefault / skills
 *   - 正文是 Handlebars 系统提示词模板,支持三类变量:
 *       {{_BI_tool}}   工具目录(未引用时自动追加到正文末尾)
 *       {{_BI_skill}}  技能清单(未引用时自动追加到正文末尾)
 *       {{_BI_input}}  用户原始录入(由 loadInputVar 提供)
 *       {{_T_xxx}}     内部存储变量(loadStorageVars 提供,可通过 setDefault 设默认值)
 *
 * 用户提示词模板:
 *   - 内联 userTemplate 字符串,或 userTemplatePath 指向另一份 md 文件
 *   - 外部文件的 front matter 只识别 setDefault
 *   - 二者均未声明时,默认模板为 "{{_BI_input}}"
 *
 * tools:
 *   - { type: builtin, id: "builtin::render_image" }
 *   - { type: search,  query: "抓取网页并转为 markdown", limit: 3 }
 *   - { type: agent,   path: "./sub/analyzer.md" }      # 相对当前文件
 *   - { type: agent,   path: "/common/reviewer.md" }    # 相对 PAC 根目录
 *   - { type: mcp,     server: filesystem, tool: read_file }  # 全局 MCP
 *   - { type: mcp_local, transport: { type: stdio, command: npx, args: [...] }, include: [...] }  # 局部 MCP
 * inputs/outputs 自动成为其 Tool 的 inputSchema/outputSchema —— 形成递归结构。
 *
 * skills:
 *   - 字符串或字符串数组,路径规则同 agent path
 *   - 指向单个技能目录(含 SKILL.md)或技能集合目录(扫描一级子目录)
 *   - 技能的 tools 声明在编译期并入所属 agent,运行期生成 load_skill / read_skill_file 两个工具
 *
 * 编译期一次性构建整棵树(纯函数,与 ctx 无关);
 * 运行期按 ctx 物化 ToolSet,保证 abort / prj 语义向下传递。
 */
export class PACFunctor implements ICapaFunctor {
    private agent: PacAgent | null = null;
    private compileError: string | null = null;
    private inflight: Promise<void> | null = null;

    constructor(readonly type: string) { }

    get id() {
        return `localAgent:${this.type}`;
    }

    /**
     * 任务加载期调用,可能多次。
     * - 每次从磁盘重新编译,拿到最新的 md / skill 文件;
     * - 并发调用合并为同一次编译;
     * - 失败不抛出:清空 agent、记录错误,由 run 报告。
     * prj 目前未参与编译(PAC 根目录由 type 经 knowledgeCenter 定位)。
     */
    compile(_prj: PacProject): Promise<void> {
        this.inflight ??= this.doCompile().finally(() => {
            this.inflight = null;
        });
        return this.inflight;
    }

    get hasAgent() {
        return this.agent !== null;
    }

    private async doCompile(): Promise<void> {
        try {
            const compiled = await compilePacAgent(this.type);
            this.agent = new PacAgent(compiled);
            this.compileError = null;
            Logger.debug(
                `[PAC] 编译完成 ${compiled.name}` +
                ` (工具 ${compiled.toolRefs.length}, 子agent ${countSub(compiled)},` +
                ` 技能 ${compiled.skills.length})`,
            );
        } catch (e) {
            this.agent = null;
            this.compileError = getErrorMessage(e);
            Logger.error(`[PAC] 编译失败(${this.type}): ${this.compileError}`, e);
        }
    }

    async run(ctx: IRunnerContext): Promise<void> {
        if (ctx.isAborted) return;
        if (!this.agent) await this.compile(ctx.prj);
        if (!this.agent) {
            ctx.error(`[PAC] agent 未就绪(${this.type}): ${this.compileError ?? "未知原因"}`);
            return;
        }
        try {
            const result = await this.agent.run(ctx);
            ctx.notify("", result);
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
export { connectLocalMcp, probeMcpMetadata, type LocalMcpClient } from "./mcp.js";
export { buildToolDoc, jsonSchemaToZod } from "./schema.js";
export {
    buildSkillDoc, buildSkillTools, discoverSkills,
    LOAD_SKILL_TOOL, READ_SKILL_FILE_TOOL, SKILL_FILE
} from "./skill.js";
export { buildUserPrompt, renderSystemPrompt, scanTemplateVars } from "./template.js";
export type {
    CompileCache, CompiledPacAgent, IPacAgent, JsonValue, LocalMcpConfig, LocalToolSpec,
    PacFrontMatter, PacToolConfig, SkillInfo, ToolOrigin, ToolRef, VarBuckets
} from "./type.js";
export {
    BI_PREFIX, classifyVars, INPUT_VAR, loadInputVar, loadStorageVars,
    SKILL_DOC_VAR, STORAGE_PREFIX, TOOL_DOC_VAR
} from "./vars.js";

