import type { IProjectContext } from "$libs/project/type.js";
import { throwPrecondition } from "$libs/utils/err.js";
import matter from "@11ty/gray-matter";
import Logger from "electron-log/main.js";
import fs from "node:fs/promises";
import { INPUT_VAR } from "../context/index.js";
import type { JsonValue, PacFrontMatter } from "../type.js";
import { resolveProjectPath } from "./paths.js";

const USER_TEMPLATE_FM_ALLOWED = new Set(["setDefault"]);

export async function resolveUserTemplate(
    fm: PacFrontMatter,
    rootBase: string[],
    prj: IProjectContext,
    currentBase: string[],
    sourcePath: string,
): Promise<{ template: string; extraDefaults: Record<string, JsonValue> }> {
    const inline = fm.userTemplate;
    const path = fm.userTemplatePath;

    const hasInline = typeof inline === "string" && inline.trim().length > 0;
    const hasPath = typeof path === "string" && path.trim().length > 0;

    if (hasInline && hasPath) {
        throwPrecondition(
            `[PAC] userTemplate 与 userTemplatePath 不可同时声明 (${sourcePath})`,
        );
    }

    if (hasInline) {
        return { template: inline as string, extraDefaults: {} };
    }

    if (hasPath) {
        const resolved = resolveProjectPath(prj, rootBase, currentBase, path as string, ".md");
        let raw: string;
        try {
            raw = await fs.readFile(resolved.abs, "utf-8");
        } catch (e) {
            throwPrecondition(
                `[PAC] 读取 userTemplatePath 失败 ${path}: ` +
                `${e instanceof Error ? e.message : String(e)} (${sourcePath})`,
            );
            return { template: "", extraDefaults: {} };
        }

        const parsed = matter(raw) as { data: Record<string, unknown>; content: string };
        const utFm = structuredClone(parsed.data ?? {});
        const extraDefaults: Record<string, JsonValue> = {};
        const relAbs = resolved.segments.slice(rootBase.length).join("/");

        for (const [k, v] of Object.entries(utFm)) {
            if (!USER_TEMPLATE_FM_ALLOWED.has(k)) {
                Logger.warn(
                    `[PAC] 用户模板 ${relAbs} 的 front matter.${k} 已忽略` +
                    `(用户模板文件仅支持 setDefault) [由 ${sourcePath} 引用]`,
                );
                continue;
            }
            if (k === "setDefault") {
                if (v && typeof v === "object" && !Array.isArray(v)) {
                    Object.assign(extraDefaults, v as Record<string, JsonValue>);
                } else {
                    Logger.warn(`[PAC] 用户模板 ${relAbs} 的 setDefault 不是对象,已忽略`);
                }
            }
        }

        const tpl = (parsed.content ?? "").trim();
        if (tpl.length === 0) {
            throwPrecondition(
                `[PAC] userTemplatePath 文件正文为空 ${path} (${sourcePath})`,
            );
        }
        return { template: tpl, extraDefaults };
    }

    return { template: `{{${INPUT_VAR}}}`, extraDefaults: {} };
}