import { EmbedKVStore } from "$libs/project/type.js";
import Logger from "electron-log/main.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { embedMetaPath } from "./path.js";

/**
 * 基于单个 JSON 文件的同步 KV,满足 EmbedKVStore 接口。
 * 路径由本模块自治(userData/tooldb/embed-meta.json),外部直接 new 即可。
 */
export class JsonFileKV implements EmbedKVStore {
    #path: string;
    #data: Record<string, unknown> = {};

    constructor(path: string = embedMetaPath()) {
        this.#path = path;
        try {
            if (existsSync(path)) {
                this.#data = JSON.parse(readFileSync(path, "utf-8"));
            }
        } catch (e) {
            Logger.warn(`[ToolDB] 读取元数据文件失败,将重建: ${path}`, e);
            this.#data = {};
        }
    }

    get<T>(key: string): T | undefined {
        return this.#data[key] as T | undefined;
    }

    set(key: string, value: unknown): void {
        this.#data[key] = value;
        try {
            mkdirSync(dirname(this.#path), { recursive: true });
            writeFileSync(this.#path, JSON.stringify(this.#data, null, 2), "utf-8");
        } catch (e) {
            Logger.error(`[ToolDB] 写入元数据文件失败: ${this.#path}`, e);
        }
    }
}