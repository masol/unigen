import { IRunnerContext } from "$types/blueprint/context.js";
import type { ICapaRunner } from "$types/blueprint/runner.js";
import { Span, SpanStatusCode, trace } from "@opentelemetry/api";
import Logger from "electron-log";

const tracer = trace.getTracer("capability-runner");

export async function withSpan(
    spanName: string,
    fn: (span: Span) => Promise<void>,
): Promise<void> {
    return tracer.startActiveSpan(spanName, async (span) => {
        try {
            await fn(span);
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            span.recordException(e instanceof Error ? e : new Error(errorMsg));
            span.setStatus({ code: SpanStatusCode.ERROR, message: errorMsg });
            throw e;
        } finally {
            span.end();
        }
    });
}

export abstract class BaseRunner implements ICapaRunner {
    abstract run(capaId: string, ctx: IRunnerContext): Promise<void>;

    protected async runCap(capaId: string, ctx: IRunnerContext): Promise<void> {
        return withSpan(`CapabilityRunner.run:${capaId}`, async (span) => {
            span.setAttribute("capability.id", capaId);
            span.addEvent("task_started", { message: `开始执行能力: ${capaId}` });

            const capafunctor = ctx.loadFunctor(capaId);

            if (!capafunctor) {
                const reason = `无法创建${capaId}对应的Runner`;
                ctx.prj.notify("task_finished", { success: false, reason, seq: ctx.seq });
                span.setStatus({ code: SpanStatusCode.ERROR, message: reason });
                return;
            }

            span.addEvent("functor_run_start");

            try {
                await capafunctor.run(ctx);
            } catch (e) {
                const errorMsg = e instanceof Error ? e.message : String(e);
                ctx.prj.notify("task_finished", {
                    success: false,
                    reason: `能力${capaId}执行错误:${errorMsg}`,
                    seq: ctx.seq,
                });
                Logger.error(`执行能力${capaId}时发生错误：`, e);
                throw e; // 交给 withSpan 记录异常并设置 span 状态
            }

            span.addEvent("functor_run_success");
            ctx.prj.notify("task_finished", { success: true, seq: ctx.seq });
            span.setStatus({ code: SpanStatusCode.OK });
        });
    }
}