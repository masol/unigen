import { IRunnerContext } from "$types/blueprint/context.js";
import type { ICapaRunner } from "$types/blueprint/runner.js";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import Logger from "electron-log";


export abstract class BaseRunner implements ICapaRunner {
    abstract run(capaId: string, ctx: IRunnerContext): Promise<void>;
    protected async runCap(capaId: string, ctx: IRunnerContext): Promise<void> {

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
                span.end();
            }
        });
    }
}
