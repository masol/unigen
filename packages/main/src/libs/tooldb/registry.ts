// packages/main/src/libs/tooldb/registry.ts
import type { Tool } from "ai";
import Logger from "electron-log/main.js";
import { sanitizeToolName } from "./naming.js";
import type { ToolMeta, ToolSource } from "./type.js";

/**
 * 内存注册表：工具元数据的单一事实源。
 *
 * 职责：
 * - 持有 id -> ToolMeta 的映射；
 * - 分配冲突可控的 llmName（保证 ToolSet key 唯一且合法）；
 * - 不涉及任何 I/O。
 *
 * 检索已移除：searchTools 由 GlobalToolDB 委托 searchsrv 完成。
 */
export class ToolRegistry {
    #map = new Map<string, ToolMeta>();
    #nameIndex = new Map<string, string>(); // 原始 name -> id
    #llmNameIndex = new Map<string, string>(); // llmName -> id

    get size(): number {
        return this.#map.size;
    }

    /** 添加或替换一个条目；自动分配/维护 llmName 唯一性，返回最终入表的 ToolMeta */
    add(
        entry: Omit<ToolMeta, "llmName"> & { llmName?: string },
    ): ToolMeta {
        // 旧条目先清理反向索引，避免陈旧引用
        const existing = this.#map.get(entry.id);
        if (existing) {
            if (this.#nameIndex.get(existing.name) === entry.id) {
                this.#nameIndex.delete(existing.name);
            }
            this.#llmNameIndex.delete(existing.llmName);
        }

        const llmName =
            entry.llmName ??
            this.#allocLlmName(entry.name, entry.id, entry.serverId);
        const full: ToolMeta = { ...entry, llmName };

        this.#map.set(full.id, full);
        if (
            this.#nameIndex.has(full.name) &&
            this.#nameIndex.get(full.name) !== full.id
        ) {
            Logger.warn(
                `[ToolDB] 工具重名: "${full.name}" (${this.#nameIndex.get(
                    full.name,
                )} -> ${full.id}),` +
                `按 name 获取将命中后者；工具流请引用 id。`,
            );
        }
        this.#nameIndex.set(full.name, full.id);
        this.#llmNameIndex.set(full.llmName, full.id);
        return full;
    }

    remove(id: string): boolean {
        const e = this.#map.get(id);
        if (!e) return false;
        this.#map.delete(id);
        if (this.#nameIndex.get(e.name) === id) this.#nameIndex.delete(e.name);
        this.#llmNameIndex.delete(e.llmName);
        return true;
    }

    /** 按来源批量移除（可选谓词细化），返回被移除的 id 列表 */
    removeBySource(
        source: ToolSource,
        predicate?: (m: ToolMeta) => boolean,
    ): string[] {
        const removed: string[] = [];
        for (const [id, e] of this.#map) {
            if (e.source !== source) continue;
            if (predicate && !predicate(e)) continue;
            this.#map.delete(id);
            if (this.#nameIndex.get(e.name) === id) {
                this.#nameIndex.delete(e.name);
            }
            this.#llmNameIndex.delete(e.llmName);
            removed.push(id);
        }
        return removed;
    }

    /** 按 id / llmName / 原始 name 取回 */
    get(idOrName: string): ToolMeta | null {
        const byId = this.#map.get(idOrName);
        if (byId) return byId;
        const id =
            this.#llmNameIndex.get(idOrName) ??
            this.#nameIndex.get(idOrName);
        return id ? this.#map.get(id) ?? null : null;
    }

    list(source?: ToolSource): ToolMeta[] {
        const all = [...this.#map.values()];
        return source ? all.filter((e) => e.source === source) : all;
    }

    clear(): void {
        this.#map.clear();
        this.#nameIndex.clear();
        this.#llmNameIndex.clear();
    }

    /** 分配唯一 llmName：原名 → serverId_原名 → 原名_N */
    #allocLlmName(name: string, id: string, serverId?: string): string {
        const base = sanitizeToolName(name);
        const candidates = [
            base,
            serverId ? sanitizeToolName(`${serverId}_${name}`) : null,
        ].filter((c): c is string => !!c);

        for (const c of candidates) {
            const holder = this.#llmNameIndex.get(c);
            if (!holder || holder === id) return c;
        }

        for (let i = 2; ; i++) {
            const c = sanitizeToolName(`${base}_${i}`);
            const holder = this.#llmNameIndex.get(c);
            if (!holder || holder === id) return c;
        }
    }
}

/** 从一个 AI SDK Tool 的 description 字段中静态化出字符串（可能是函数形式） */
export function resolveToolDescription(t: Tool): string {
    const d = (t as { description?: unknown }).description;
    if (typeof d === "string") return d;
    if (typeof d === "function") {
        try {
            const r = (d as (options: { context: unknown }) => string)({
                context: undefined,
            });
            return typeof r === "string" ? r : "";
        } catch {
            return "";
        }
    }
    return "";
}