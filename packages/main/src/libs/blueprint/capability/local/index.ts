import type { IRunnerContext } from "$types/blueprint/context.js";
import Logger from "electron-log/main.js";
import { getErrorMessage } from "radashi";
import { ICapaFunctor } from "../type.js";
import { PacAgent } from "./agent/index.js";
import { compilePacAgent } from "./compiler.js";
import type { CompiledPacAgent } from "./type.js";

type PacProject = IRunnerContext["prj"];

/**
 * PAC (Prompt-as-Code) 本地能力运行环境。
 *
 * 一份 markdown = 一个 agent:
 *   - front matter 声明 name / description / inputs / outputs(JSON Schema)/
 *     tools / maxSteps / userTemplate(内联)/ userTemplatePath(外部文件)/
 *     setDefault / skills / streaming / thinking / history / timeout
 *   - 正文是 Handlebars 系统提示词模板,支持四类变量:
 *       {{_BI_tool}}     工具目录(未引用时自动追加到正文末尾)
 *       {{_BI_skill}}    技能清单(未引用时自动追加到正文末尾)
 *       {{_BI_input}}    用户原始录入
 *       {{_BI_history}}  历史消息 JSON(字符串,给模板展开用;不含本轮 user 消息)
 *       {{_T_xxx}}       内部存储变量,可通过 setDefault 设默认值
 *
 * 用户提示词模板:内联 userTemplate 字符串,或 userTemplatePath 指向另一份 md 文件,
 * 均未声明时默认模板为 "{{_BI_input}}"。
 *
 * **根 agent 的输入/输出**:根 agent 不接受结构化 inputs/outputs——其输入是用户原始录入
 * (文本/文档/语音…),输出直接响应用户。编译期若根文件声明了 inputs/outputs,告警并忽略。
 *
 * **常用开关(settings.ts 统一处理,全部给默认值):**
 *   streaming  默认 true,根 agent 流式输出,ctx.notify("stream", chunk)
 *   thinking   默认 true,启用思考 providerOptions
 *   history    默认加载全部历史;0 禁用;N>0 最多最近 N 条
 *   maxSteps   默认 10
 *   timeout    默认 provider 默认;可写数字(总超时毫秒)或对象
 *              { totalMs?, stepMs?, firstChunkMs?, chunkMs? }
 *
 * **历史管理(事务化)**:每个 PAC 文件以 compiled.id(相对源文件路径)识别。
 * HistoryStore 的实际存取由宿主通过 registerHistoryStore() 注入,复合键为
 * `${ctx.sessId}:${compiled.id}`。
 *
 * **Trace 体系**:全链路汇报进度——root agent 节点为树根,工具/子 agent/推理分别为树节点。
 * Trace 节点 id 编码规范见 traceid.ts。消息与 trace 通过 messageId 关联持久化到 PrjDB。
 *
 * **流式消息**:根 agent 流式生成时,每个 delta 通过 ctx.notify("stream", chunk) 实时汇报,
 * 并定期落库到 messages 表 content 列;thinking 部分通过 message.thinking.delta 独立汇报。
 *
 * 调用流程:
 *   1. 读取 N 条历史(调用前,不含本轮)
 *   2. 读取时若末尾是孤立 user(进程崩溃或旧数据遗留),自动追加 SYSTEM_FAILURE_MARKER
 *      占位 assistant 并持久化
 *   3. 在内存里组装 [历史..., 本轮 user] 作为 messages 传给 agent
 *   4. 同步创建 root agent trace 节点 (status=running)
 *   5. 开始调用——流式汇报:
 *      - 每条 tool 调用创建 tool trace 节点(或 agent 子调用的 agent 节点)
 *      - thinking 内容创建 reasoning trace 节点,detail 增量追加
 *      - 文本 delta 通过 stream 通道汇报,同时定期落库 message content
 *   6. 调用成功 → 更新 agent 节点 status=success,完成 message 落库；
 *      → 写入一对 (user, assistant 结果) 到 history store
 *      调用失败 → 更新 agent 节点 status=error；
 *      → 写入一对 (user, SYSTEM_FAILURE_MARKER) 到 history store 并抛出原始错误
 *      中断场景 → 不写历史,静默返回空字符串
 *
 * 工具型子 agent(被父 agent 反复调用的无状态工具)应在 front matter 中显式声明
 * `history: 0`,避免结构化 JSON user 消息无限累积在自己的历史里。
 *
 * **中断与超时**:ctx.signal 透传给 agent.generate/stream,provider 请求可被即时中断;
 * settings.timeout 透传为 SDK 的 timeout 参数。
 *
 * **模型选择:**
 *   运行期每一层(含子 tools)读取 prjdb.get("model") 决定使用哪个模型。
 *   字符串 → modelPattern;对象 → getSmartModel 的 options 透传。
 *   模型 id (providerId/modelId) 在 trace 节点 description 与 message.meta 中汇报。
 *
 * **文件缺失:** pac/index.md 不存在时不报错,构造一个"直通 agent"
 * (无系统提示词、无工具,userTemplate = {{_BI_input}}),等价于把用户原始录入直送 LLM。
 *
 * 编译期一次性构建整棵树(纯函数,与 ctx 无关);
 * 运行期按 ctx 物化 ToolSet,并为每个步骤分配 stepPath(如 "1.2.1"),
 * 通过 ctx.debug 上报进入/完成及输入/输出,通过 ctx.notify("usage", ...) 上报 token 用量。
 */
export class PACFunctor implements ICapaFunctor {
    private agent: PacAgent | null = null;
    private compileError: string | null = null;
    private inflight: Promise<void> | null = null;

    constructor(readonly type: string) { }

    get id() {
        return `localAgent:${this.type}`;
    }

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
                `[PAC] 编译完成 ${compiled.name} [id=${compiled.id}]` +
                ` (passthrough=${compiled.passthrough}, 工具 ${compiled.toolRefs.length},` +
                ` 子agent ${countSub(compiled)}, 技能 ${compiled.skills.length})`,
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

/* ────────────────────────────────────────────────────────── */

export { buildAgentTool, PacAgent, type PacRunState } from "./agent/index.js";
export { buildAgentId, compilePacAgent, createCompileCache, resolvePacPath } from "./compiler.js";
export {
    appendHistoryMessage, BI_PREFIX, buildHistoryId,
    classifyVars, clearHistory, getHistoryStore,
    HISTORY_VAR, INPUT_VAR, loadHistoryMessages, loadHistoryVar,
    loadInputVar, loadStorageVars, registerHistoryStore,
    SKILL_DOC_VAR, STORAGE_PREFIX, SYSTEM_FAILURE_MARKER, TOOL_DOC_VAR,
    type HistoryStore
} from "./context/index.js";
export { loadExternalTools } from "./loader.js";
export { connectLocalMcp, probeMcpMetadata, type LocalMcpClient } from "./mcp.js";
export { buildToolDoc, jsonSchemaToZod } from "./schema.js";
export { resolveModelOptions, resolveOwnDefaults, resolveSettings } from "./settings.js";
export {
    buildSkillDoc, buildSkillTools, discoverSkills,
    LOAD_SKILL_TOOL, READ_SKILL_FILE_TOOL, SKILL_FILE
} from "./skill.js";
export { buildUserPrompt, renderSystemPrompt, scanTemplateVars } from "./template.js";
export {
    agentTraceId, nextSeq, reasoningTraceId, stepTraceId, toolTraceId
} from "./traceid.js";
export type {
    CompileCache, CompiledPacAgent, IPacAgent, JsonValue, LocalMcpConfig, LocalToolSpec,
    ModelSelectOptions, PacFrontMatter, PacTimeoutConfig, PacToolConfig, ResolvedSettings,
    SkillInfo, ToolOrigin, ToolRef, VarBuckets
} from "./type.js";

