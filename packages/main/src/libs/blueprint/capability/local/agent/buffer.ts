// packages/main/src/libs/blueprint/capability/local/agent/buffer.ts

import type { PrjDB } from "$libs/project/controllers/drizzle/index.js";
import Logger from "electron-log/main.js";

export class MessageDeltaBuffer {
    private buffer = "";
    private lastFlushTime = Date.now();
    private readonly flushIntervalMs = 500;
    private readonly flushThreshold = 200;

    push(delta: string): void {
        this.buffer += delta;
        if (
            this.buffer.length >= this.flushThreshold ||
            Date.now() - this.lastFlushTime > this.flushIntervalMs
        ) {
            this.flush();
        }
    }

    flush(prjdb?: PrjDB, messageId?: string): void {
        if (this.buffer.length === 0) return;
        if (prjdb && messageId) {
            try {
                prjdb.appendMessageDelta(messageId, this.buffer);
            } catch (e) {
                Logger.warn("[PAC] appendMessageDelta 失败:", e);
            }
        }
        this.buffer = "";
        this.lastFlushTime = Date.now();
    }

    getBuffer(): string {
        return this.buffer;
    }
}