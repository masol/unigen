import { IRunnerContext } from "$types/blueprint/context.js";
import type { ICapaRunner } from "$types/blueprint/runner.js";
import { Span, SpanStatusCode, trace } from "@opentelemetry/api";
import Logger from "electron-log";
import { isString } from "radashi";
import { ICapaFunctor } from "../capability/type.js";

const tracer = trace.getTracer("capability-runner");

/**
 * 在给定 span 中执行 fn，并将 fn 的返回值原样透出。
 * 泛型化以支持 runCap 等需要把能力返回值沿链路透传的场景；
 * 原 void 用法仍可编译（T 推断为 void 时行为与之前一致）。
 */
export async function withSpan<T>(
    spanName: string,
    fn: (span: Span) => Promise<T>,
): Promise<T> {
    return tracer.startActiveSpan(spanName, async (span) => {
        try {
            return await fn(span);
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
    // 保持与 ICapaRunner 一致的 Promise<void> 契约，
    // 以免破坏外部（IPC 等）现有调用面；返回值请通过各实现的自有入口获取。
    abstract run(capaId: string, ctx: IRunnerContext): Promise<string>;

    /**
     * 执行一个能力（字符串 id 或现成的 functor），并把 functor.run 的
     * 最终 message 向上透出。
     */
    protected async runCap(capa: string | ICapaFunctor, ctx: IRunnerContext): Promise<string> {
        const capaId = isString(capa) ? capa : "functor"
        return withSpan(`CapabilityRunner.run:${capaId}`, async (span) => {
            span.setAttribute("capability.id", capaId);
            span.addEvent("task_started", { message: `开始执行能力: ${capaId}` });

            const capafunctor = isString(capa) ? ctx.loadFunctor(capa) : capa;

            if (!capafunctor) {
                const reason = `无法创建${capaId}对应的Runner`;
                ctx.prj.notify("task_finished", { success: false, reason, seq: ctx.seq });
                span.setStatus({ code: SpanStatusCode.ERROR, message: reason });
                return "";
            }

            span.addEvent("functor_run_start");

            try {
                const result = await capafunctor.run(ctx);
                span.addEvent("functor_run_success");
                ctx.prj.notify("task_finished", { success: true, seq: ctx.seq });
                span.setStatus({ code: SpanStatusCode.OK });
                return result;
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
        });
    }
}