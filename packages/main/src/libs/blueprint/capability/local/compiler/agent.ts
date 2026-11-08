import type { IProjectContext } from "$libs/project/type.js";
import { throwPrecondition } from "$libs/utils/err.js";
import Logger from "electron-log/main.js";
import { basename } from "node:path";
import { z } from "zod";
import {
    INPUT_VAR,
    classifyVars,
} from "../context/index.js";
import { buildToolDoc, jsonSchemaToZod, renderOutputSemantics } from "../schema.js";
import { resolveOwnDefaults, resolveSettings } from "../settings.js";
import { scanTemplateVars } from "../template.js";
import type {
    CompileCache,
    CompiledPacAgent,
    JsonValue,
} from "../type.js";
import { extractFrontMatter } from "./frontmatter.js";
import {
    buildAgentId,
    getAbsPath,
    sameSegments,
} from "./paths.js";
import { loadToolRefs } from "./tools.js";
import { resolveUserTemplate } from "./user-template.js";

export async function compileFile(
    cc: CompileCache,
    sourceSegments: string[],
    prj: IProjectContext,
): Promise<CompiledPacAgent> {
    const key = sourceSegments.join("/");

    const hit = cc.compiled.get(key);
    if (hit) return hit;

    if (cc.compiling.has(key)) {
        throwPrecondition(`[PAC] 检测到循环引用: ${key}`);
    }
    cc.compiling.add(key);

    try {
        const compiled = await compileOne(cc, sourceSegments, prj);
        cc.compiled.set(key, compiled);
        return compiled;
    } finally {
        cc.compiling.delete(key);
    }
}

async function compileOne(
    cc: CompileCache,
    sourceSegments: string[],
    prj: IProjectContext,
): Promise<CompiledPacAgent> {
    // Stage 1: 定位并读取源文件、抽取 front matter。
    const sourcePath = getAbsPath(prj, sourceSegments);
    const { fm, body } = await extractFrontMatter(sourcePath);

    // Stage 2: 正文处理。
    // 当前直接使用原文；未来如需 LLM 介入（例如检查正文是否可转化为纯代码），
    // 应通过显式注入的模型/上下文实现，不在此处隐式调用。
    let systemTemplate = body;

    const name = fm.name ?? basename(sourcePath, ".md");
    const relSrc = sourceSegments.slice(cc.rootBase.length).join("/");
    const description =
        fm.description ?? `PAC agent "${name}" (${relSrc})`;
    const base = sourceSegments.slice(0, -1);
    const id = buildAgentId(cc.rootBase, sourceSegments);
    const isRoot = !!cc.rootEntry && sameSegments(sourceSegments, cc.rootEntry);

    Logger.debug(`[PAC] 编译 ${name} [id=${id}, root=${isRoot}] ← ${relSrc}`);

    // 根 agent 不应该声明 inputs/outputs——它的输入是用户的原始录入(文本/文档/语音…),
    // 输出是直接回复给用户的内容,无需结构化契约。
    if (isRoot) {
        if (fm.inputs && Object.keys(fm.inputs).length > 0) {
            Logger.warn(
                `[PAC] 根 agent 不应声明 inputs,已忽略 (${relSrc})。` +
                `根 agent 的输入是用户原始录入,通过 {{${INPUT_VAR}}} 展开。`,
            );
        }
        if (fm.outputs && Object.keys(fm.outputs).length > 0) {
            Logger.warn(
                `[PAC] 根 agent 不应声明 outputs,已忽略 (${relSrc})。` +
                `根 agent 直接响应用户,无结构化输出契约。`,
            );
        }
    }

    // Stage 3: 构建输入/输出契约。
    const inputSchema = isRoot
        ? z.object({})
        : jsonSchemaToZod(fm.inputs, "inputs", sourcePath);
    const outputSchema = isRoot
        ? null
        : (fm.outputs ? jsonSchemaToZod(fm.outputs, "outputs", sourcePath) : null);

    // Stage 4: 工具引用。
    const taken = new Set<string>();
    const compileSubAgent = (segments: string[]) => compileFile(cc, segments, prj);
    const toolRefs = await loadToolRefs(
        fm.tools ?? [],
        cc.rootBase,
        prj,
        base,
        sourcePath,
        taken,
        compileSubAgent,
    );

    // Stage 5: 工具目录。
    const toolDoc = await buildToolDoc(toolRefs);

    // Stage 6: 用户模板与默认值。
    const { template: userTemplate, extraDefaults: utExtraDefaults } =
        await resolveUserTemplate(fm, cc.rootBase, prj, base, sourcePath);

    const mainDefaults = resolveOwnDefaults(fm);
    for (const k of Object.keys(utExtraDefaults)) {
        if (k in mainDefaults) {
            Logger.warn(
                `[PAC] ${relSrc}: ` +
                `用户模板 setDefault.${k} 被主 agent setDefault.${k} 覆盖`,
            );
        }
    }
    const ownDefaults: Readonly<Record<string, JsonValue>> = Object.freeze({
        ...utExtraDefaults,
        ...mainDefaults,
    });

    // Stage 7: 变量扫描与输出要点补全。
    // 工具目录不再自动追加：只有模板显式引用 {{_BI_tool}} 时，
    // 运行期 buildContext 才会把 toolDoc 放入渲染上下文。
    const scanAll = () =>
        classifyVars([
            ...scanTemplateVars(systemTemplate),
            ...scanTemplateVars(userTemplate),
        ]);

    let vars = scanAll();

    if (outputSchema) {
        const semantics = await renderOutputSemantics(outputSchema);
        if (semantics) {
            systemTemplate =
                `${systemTemplate}\n\n## 最终回复要点\n\n` +
                `你的最终回复应清楚覆盖以下要点,供上游读者直接理解:\n\n${semantics}\n`;
            vars = scanAll();
        }
    }

    return {
        id,
        name,
        description,
        passthrough: false,
        config: fm,
        systemTemplate,
        userTemplate,
        inputSchema,
        outputSchema,
        toolRefs,
        toolDoc,
        vars,
        ownDefaults,
        settings: resolveSettings(fm),
        base,
        rootBase: cc.rootBase,
        sourcePath,
    };
}