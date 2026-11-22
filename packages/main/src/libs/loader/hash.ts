// packages/main/src/libs/loader/hash.ts
//
// 文件哈希工具。基于 @noble/hashes（纯 JS，可审计、无原生依赖）。
//
// 要求：`@noble/hashes` >= 2.x（ESM-only，路径带 `.js` 后缀）。
// 若项目仍为 1.x，请改为：
//   import { sha256 } from '@noble/hashes/sha256';
//   import { bytesToHex } from '@noble/hashes/utils';

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { createReadStream } from "node:fs";

export interface HashFileOptions {
    /** 取消信号。触发后立即中断读取。 */
    signal?: AbortSignal;
}

/**
 * 流式计算文件的 SHA256，返回 hex（小写）。
 */
export async function sha256FileHex(
    path: string,
    opts: HashFileOptions = {},
): Promise<string> {
    const hasher = sha256.create();
    const stream = createReadStream(path);

    const onAbort = () => stream.destroy(new Error("hash 计算已取消"));
    if (opts.signal?.aborted) {
        stream.destroy();
        throw new Error("hash 计算已取消");
    }
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    try {
        for await (const chunk of stream) {
            const bytes = Buffer.isBuffer(chunk)
                ? chunk
                : Buffer.from(chunk as Uint8Array);
            hasher.update(bytes);
        }
    } finally {
        opts.signal?.removeEventListener("abort", onAbort);
    }

    return bytesToHex(hasher.digest());
}

/** 一次性计算内存数据的 SHA256。 */
export function sha256Hex(data: Uint8Array): string {
    return bytesToHex(sha256(data));
}