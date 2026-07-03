import type { IRunnerContext } from '$types/blueprint/context.js';
import { RunState } from '$types/index.js';
import { SpanStatusCode, trace } from "@opentelemetry/api";
import Logger from 'electron-log/main.js';


export class CapaRunner {
    #state: RunState = "idle";
    #running: Promise<void> | null = null;
    #ctx: IRunnerContext | null = null;
    #startTime: number = 0;
    constructor() {
    }

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

        const tracer = trace.getTracer("capability-runner");

        return tracer.startActiveSpan(`CapabilityRunner.run:${capaId}`, async (span) => {
            try {
                span.setAttribute("capability.id", capaId);
                span.addEvent("task_started", { message: `开始执行能力: ${capaId}` });

                // @todo: 现阶段，runner并未动态变更，是否缓存caparunner? -- 需要使用updatedAt来缓存。
                const capafunctor = ctx.loadFunctor(capaId);

                if (!capafunctor) {
                    const reason = `无法创建${capaId}对应的Runner`;
                    ctx.prj.notify("task_finished", { success: false, reason });

                    span.setStatus({
                        code: SpanStatusCode.ERROR,
                        message: reason
                    });
                    return;
                }

                // functor runner.
                span.addEvent("functor_run_start");
                await capafunctor.run(ctx);
                span.addEvent("functor_run_success");

                ctx.prj.notify("task_finished", { success: true });

                // 成功状态下不需要带 message（即使带了也会被 OTel 忽略）
                span.setStatus({ code: SpanStatusCode.OK });

            } catch (e) {
                const errorMsg = e instanceof Error ? e.message : String(e);
                ctx.prj.notify("task_finished", { success: false, reason: `能力${capaId}执行错误:${errorMsg}` });
                Logger.error(`执行能力${capaId}时发生错误：`, e);

                span.recordException(e instanceof Error ? e : new Error(errorMsg));

                span.setStatus({
                    code: SpanStatusCode.ERROR,
                    message: `能力${capaId}执行错误: ${errorMsg}`
                });
            } finally {
                this.#state = "idle";
                this.#running = null;
                this.#ctx = null;

                span.end();
            }
        });
    }
}