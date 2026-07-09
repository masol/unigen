import type { IRunnerContext } from '$types/blueprint/context.js';
import { RunState } from '$types/index.js';
import Logger from 'electron-log/main.js';
import { BaseRunner } from './base.js';


// 主任务执行器，维护异步状态--后台长期执行。
export class CapaRunner extends BaseRunner {
    #state: RunState = "idle";
    #running: Promise<void> | null = null;
    #ctx: IRunnerContext | null = null;
    #startTime: number = 0;

    get state(): RunState {
        return this.#state;
    }

    get startTime(): number {
        return this.#startTime;
    }

    async waitFinish(): Promise<void> {
        if (this.#running) {
            await this.#running;
            this.#running = null;
        }
        this.#ctx = null;
    }

    stop(bForce: boolean = false) {
        if (this.#state === "idle") {
            return;
        }

        if (this.#ctx) {
            this.#ctx.triggerAbort(bForce);
        }
        if (bForce) {
            // 清空#running等环境。
            this.#ctx = null;
            this.#running = null;
            this.#state = "idle";
        } else {
            this.#state = "terminating"
        }
    }

    start(capaId: string, ctx: IRunnerContext) {
        if (this.#state === "idle") {
            if (this.#running) {
                Logger.warn("[WorkflowRunner] 历史执行尚未执行完毕，如果未终止，这将导致其虚悬。")
                this.stop(true);
            }
            this.#running = this.run(capaId, ctx);
            this.#ctx = ctx;
        }
    }

    async run(capaId: string, ctx: IRunnerContext): Promise<void> {
        this.#startTime = new Date().getTime();
        this.#state = "running";

        // 不会抛出异常的。
        await this.runCap(capaId, ctx);

        this.#state = "idle";
        this.#running = null;
        this.#ctx = null;
    }
}
