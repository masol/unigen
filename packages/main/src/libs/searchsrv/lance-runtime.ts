import { app } from "electron";
import { join } from "node:path";

export type LanceRuntime = Awaited<typeof import("@lancedb/lancedb")>;

const KEY = Symbol.for("unigen.singleton.globalLanceRuntime");

export async function getLanceRuntime(): Promise<LanceRuntime> {
    const g = globalThis as unknown as Record<symbol, LanceRuntime | undefined>;
    const cached = g[KEY];
    if (cached) return cached;

    process.env.LANCE_LANGUAGE_MODEL_HOME = join(
        app.getPath("userData"),
        "lance-models",
    );

    const runtime = await import("@lancedb/lancedb");
    g[KEY] = runtime;
    return runtime;
}