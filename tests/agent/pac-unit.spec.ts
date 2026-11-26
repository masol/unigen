// tests/agent/pac-unit.spec.ts
//
// PAC 编译/运行期纯逻辑单测（不启动 Electron）。
//
// 由 tests/e2e.spec.ts 的 runPacUnitTest(test) 注册，与 runCommonTest /
// runMainTest 保持同一测试架构。
//
// 覆盖范围刻意限定为「内部跨模块 import 全部是 import type」的三个模块，
// 保证 Playwright Node worker 的 esbuild 转译可以安全加载：
//   - traceid.ts       : 内部键编码 + 序号分配
//   - context/vars.ts  : 模板变量分桶
//   - agent/types.ts   : TraceIdRegistry（内部键 ↔ UUID）
//
// compile / run 的集成测试需要 Electron main 进程上下文，见文末说明。
import { expect } from "@playwright/test";
import type { UnigenTestType } from "../type";

import { TraceIdRegistry } from "../../packages/main/src/libs/blueprint/capability/local/agent/types";
import {
    BI_PREFIX,
    STORAGE_PREFIX,
    classifyVars,
    emptyBuckets,
} from "../../packages/main/src/libs/blueprint/capability/local/context/vars";
import {
    agentTraceId,
    nextSeq,
    reasoningTraceId,
    stepTraceId,
    toolTraceId,
} from "../../packages/main/src/libs/blueprint/capability/local/traceid";

const UUID_V4_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 构造一个只满足 toolTraceId / agentTraceId 需要的最小 ToolRef 形状。
 * 生产代码里 ToolRef 是强类型；测试里只需要 meta / mcpLocal / agent 三块。
 */
function ref(partial: Record<string, unknown>): never {
    return partial as never;
}

export function runPacUnitTest(test: UnigenTestType) {
    test.describe("PAC traceid", () => {
        test("nextSeq 按 key 独立递增，首次为 1", () => {
            const counters = new Map<string, number>();

            expect(nextSeq(counters, "agent:index")).toBe(1);
            expect(nextSeq(counters, "agent:index")).toBe(2);
            expect(nextSeq(counters, "agent:index")).toBe(3);

            expect(nextSeq(counters, "agent:sub/foo")).toBe(1);
            expect(nextSeq(counters, "agent:sub/foo")).toBe(2);

            expect(counters.get("agent:index")).toBe(3);
            expect(counters.get("agent:sub/foo")).toBe(2);
        });

        test("agentTraceId 首次不带后缀，后续带 #n", () => {
            expect(agentTraceId("index", 1)).toBe("agent|index");
            expect(agentTraceId("sub/foo", 1)).toBe("agent|sub/foo");
            expect(agentTraceId("sub/foo", 2)).toBe("agent|sub/foo#2");
            expect(agentTraceId("sub/foo", 10)).toBe("agent|sub/foo#10");
        });

        test("stepTraceId / reasoningTraceId 遵循前缀约定", () => {
            expect(stepTraceId("550e8400-e29b-41d4-a716-446655440000")).toBe(
                "step:550e8400-e29b-41d4-a716-446655440000",
            );
            expect(reasoningTraceId("agent|sub/foo")).toBe("reasoning:agent|sub/foo");
            expect(reasoningTraceId("agent|sub/foo#2")).toBe("reasoning:agent|sub/foo#2");
        });

        test("toolTraceId: builtin 用 meta.id，缺失时退回 ref.key", () => {
            expect(
                toolTraceId(
                    ref({ key: "web_search", origin: "builtin", meta: { id: "web" }, agent: null }),
                    1,
                ),
            ).toBe("builtin:web");

            expect(
                toolTraceId(
                    ref({ key: "web_search", origin: "builtin", meta: { id: "web" }, agent: null }),
                    2,
                ),
            ).toBe("builtin:web#2");

            expect(
                toolTraceId(
                    ref({ key: "fallback_key", origin: "builtin", meta: null, agent: null }),
                    1,
                ),
            ).toBe("builtin:fallback_key");
        });

        test("toolTraceId: search 用 meta.llmName", () => {
            expect(
                toolTraceId(
                    ref({
                        key: "raw_search_key",
                        origin: "search",
                        meta: { llmName: "web_search" },
                        agent: null,
                    }),
                    1,
                ),
            ).toBe("search:web_search");
        });

        test("toolTraceId: mcp_global 用 serverId + name，缺 meta 时退回 unknown", () => {
            expect(
                toolTraceId(
                    ref({
                        key: "raw_mcp_key",
                        origin: "mcp_global",
                        meta: { serverId: "brave", name: "search" },
                        agent: null,
                    }),
                    1,
                ),
            ).toBe("mcp:brave:search");

            expect(
                toolTraceId(
                    ref({ key: "raw_mcp_key", origin: "mcp_global", meta: null, agent: null }),
                    1,
                ),
            ).toBe("mcp:unknown:raw_mcp_key");
        });

        test("toolTraceId: mcp_local 用 alias + tool.name，alias 缺省为 local", () => {
            expect(
                toolTraceId(
                    ref({
                        key: "y",
                        origin: "mcp_local",
                        meta: null,
                        agent: null,
                        mcpLocal: { config: { alias: "local" }, tool: { name: "analyze" } },
                    }),
                    1,
                ),
            ).toBe("mcplocal:local:analyze");

            expect(
                toolTraceId(
                    ref({
                        key: "y2",
                        origin: "mcp_local",
                        meta: null,
                        agent: null,
                        mcpLocal: { config: {}, tool: { name: "analyze" } },
                    }),
                    1,
                ),
            ).toBe("mcplocal:local:analyze");
        });

        test("toolTraceId: agent 回退到 agent|id", () => {
            expect(
                toolTraceId(
                    ref({
                        key: "sub",
                        origin: "agent",
                        meta: null,
                        agent: { id: "sub/foo" },
                    }),
                    1,
                ),
            ).toBe("agent|sub/foo");
        });
    });

    test.describe("TraceIdRegistry", () => {
        test("getOrCreate 幂等，同一内部键恒返回同一 UUID", () => {
            const reg = new TraceIdRegistry();

            const a1 = reg.getOrCreate("agent:index:1");
            const a2 = reg.getOrCreate("agent:index:1");

            expect(a2).toBe(a1);
            expect(a1).toMatch(UUID_V4_RE);
        });

        test("不同内部键返回不同 UUID", () => {
            const reg = new TraceIdRegistry();

            const a = reg.getOrCreate("agent:index:1");
            const b = reg.getOrCreate("agent:index:2");
            const c = reg.getOrCreate("agent:sub/foo:1");

            expect(new Set([a, b, c]).size).toBe(3);
        });

        test("get 只查询不创建", () => {
            const reg = new TraceIdRegistry();

            expect(reg.get("missing")).toBeUndefined();

            const id = reg.getOrCreate("agent:x:1");
            expect(reg.get("agent:x:1")).toBe(id);
            expect(reg.get("still-missing")).toBeUndefined();
        });

        test("internalKeyOf 能反查内部键", () => {
            const reg = new TraceIdRegistry();

            const id = reg.getOrCreate("agent:x:1");
            expect(reg.internalKeyOf(id)).toBe("agent:x:1");
            expect(reg.internalKeyOf("not-a-uuid")).toBeUndefined();
        });

        test("两次独立实例对同一内部键产出不同 UUID（跨 run 隔离）", () => {
            const r1 = new TraceIdRegistry();
            const r2 = new TraceIdRegistry();

            expect(r1.getOrCreate("agent:x:1")).not.toBe(r2.getOrCreate("agent:x:1"));
        });

        test("通过父 UUID 反查内部键后可派生子节点 UUID", () => {
            const reg = new TraceIdRegistry();

            const agentInternal = "agent:sub/foo:1";
            const agentId = reg.getOrCreate(agentInternal);
            const parentInternal = reg.internalKeyOf(agentId) ?? agentId;

            const outputId = reg.getOrCreate(`${parentInternal}:output`);
            const reasoningId = reg.getOrCreate(`${parentInternal}:reasoning:0`);

            expect(outputId).not.toBe(agentId);
            expect(reasoningId).not.toBe(agentId);
            expect(outputId).not.toBe(reasoningId);
            expect(reg.getOrCreate(`${agentInternal}:output`)).toBe(outputId);
        });
    });

    test.describe("PAC context vars", () => {
        test("classifyVars 按前缀分桶，保序且去重", () => {
            const b = classifyVars([
                `${BI_PREFIX}input`,
                `${STORAGE_PREFIX}name`,
                "foo",
                `${BI_PREFIX}input`,
                `${BI_PREFIX}history`,
                `${STORAGE_PREFIX}name`,
            ]);

            expect(b.bi).toEqual([`${BI_PREFIX}input`, `${BI_PREFIX}history`]);
            expect(b.storage).toEqual([`${STORAGE_PREFIX}name`]);
            expect(b.unknown).toEqual(["foo"]);
            expect(b.all).toEqual([
                `${BI_PREFIX}input`,
                `${STORAGE_PREFIX}name`,
                "foo",
                `${BI_PREFIX}history`,
            ]);
        });

        test("空输入返回空桶", () => {
            expect(classifyVars([])).toEqual({
                bi: [],
                storage: [],
                unknown: [],
                all: [],
            });
        });

        test("带子路径的变量按首段归入对应桶", () => {
            const b = classifyVars([
                `${BI_PREFIX}input.foo`,
                `${STORAGE_PREFIX}a.b`,
                `custom.x`,
            ]);

            expect(b.bi).toEqual([`${BI_PREFIX}input.foo`]);
            expect(b.storage).toEqual([`${STORAGE_PREFIX}a.b`]);
            expect(b.unknown).toEqual(["custom.x"]);
        });

        test("emptyBuckets 每次返回新对象，互不共享引用", () => {
            const a = emptyBuckets();
            const b = emptyBuckets();

            expect(a).not.toBe(b);
            expect(a).toEqual(b);

            a.bi.push("mutated");
            expect(b.bi).toEqual([]);
        });
    });
}