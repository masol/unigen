import Logger from "electron-log/main.js";
import { z } from "zod";
import { INPUT_VAR, classifyVars } from "../context/index.js";
import { resolveSettings } from "../settings.js";
import type { CompiledPacAgent } from "../type.js";

/**
 * 构造直通 agent:无系统提示词、无工具,userTemplate 为 {{_BI_input}}。
 * 等价于把用户原始录入直送 LLM。
 */
export function buildPassthroughAgent(prjType: string, base: string[]): CompiledPacAgent {
    const name = prjType || "passthrough";
    const vars = classifyVars([INPUT_VAR]);

    Logger.warn(`[PAC] 未找到入口文件,构造直通 agent "${name}"`);

    return {
        id: `__passthrough__/${prjType || "default"}`,
        name,
        description: `PAC agent "${name}" (直通模式,未找到入口文件)`,
        passthrough: true,
        config: {},
        systemTemplate: "",
        userTemplate: `{{${INPUT_VAR}}}`,
        inputSchema: z.object({}),
        outputSchema: null,
        toolRefs: [],
        toolDoc: "_当前 agent 未声明任何工具。_",
        vars,
        ownDefaults: Object.freeze({}),
        settings: resolveSettings({}),
        base,
        rootBase: base,
        sourcePath: `<passthrough:${prjType}>`,
    };
}