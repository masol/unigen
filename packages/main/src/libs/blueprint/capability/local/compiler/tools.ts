import type { IProjectContext } from "$libs/project/type.js";
import Logger from "electron-log/main.js";
import { loadExternalTools } from "../loader.js";
import type {
    CompiledPacAgent,
    PacToolConfig,
    ToolRef,
} from "../type.js";
import { resolveProjectPath, uniqueKey } from "./paths.js";

export type CompileSubAgent = (segments: string[]) => Promise<CompiledPacAgent>;

export async function loadToolRefs(
    configs: PacToolConfig[],
    rootBase: string[],
    prj: IProjectContext,
    currentBase: string[],
    sourcePath: string,
    taken: Set<string>,
    compileSubAgent: CompileSubAgent,
): Promise<ToolRef[]> {
    const refs: ToolRef[] = [];

    for (const cfg of configs) {
        try {
            if (cfg.type === "agent") {
                const resolved = resolveProjectPath(prj, rootBase, currentBase, cfg.path, ".md");
                const sub = await compileSubAgent(resolved.segments);
                const key = uniqueKey(cfg.alias ?? sub.name, taken);
                taken.add(key);
                refs.push({ key, origin: "agent", meta: null, agent: sub, declaredAs: cfg });
                continue;
            }

            const loaded = await loadExternalTools(cfg);

            if (loaded.kind === "mcp_local") {
                const prefix = loaded.config.alias ? `${loaded.config.alias}_` : "";
                for (const info of loaded.tools) {
                    const key = uniqueKey(`${prefix}${info.name}`, taken);
                    taken.add(key);
                    refs.push({
                        key,
                        origin: "mcp_local",
                        meta: null,
                        agent: null,
                        mcpLocal: { config: loaded.config, tool: info },
                        declaredAs: cfg,
                    });
                }
                continue;
            }

            const origin = cfg.type === "mcp" ? "mcp_global" : cfg.type;
            for (const [rawKey, meta] of Object.entries(loaded.tools)) {
                const key = uniqueKey(rawKey, taken);
                taken.add(key);
                refs.push({ key, origin, meta, agent: null, declaredAs: cfg });
            }
        } catch (e) {
            Logger.error(
                `[PAC] ${sourcePath}: 加载工具失败 ${JSON.stringify(cfg)}`,
                e,
            );
        }
    }

    return refs;
}