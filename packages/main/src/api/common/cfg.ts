/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    getGlobalEmbeddingService,
    getGlobalRerankService,
    recreateFtsIndexes,
} from '$libs/searchsrv/index.js'
import { configService } from '$libs/store/index.js'
import { secondConfig } from '$libs/store/second.js'
import { getTheme, resetTheme, setTheme } from '$libs/store/theme.js'
import { dataCenter } from '$libs/utils/sys/data.js'
import { recentProjectSchema } from '$types/shared/api/recents.js'
import { GetThemeSchema } from '$types/shared/api/theme.js'
import { mcpServerConfigSchema } from '$types/shared/mcp.js'
import { os } from '@orpc/server'
import { nativeTheme } from 'electron'
import { z } from 'zod'

/**
 * 获取整个配置对象
 */
const getAll = os
    .output(z.record(z.string(), z.unknown()))
    .handler(async () => {
        return configService().getAll() as unknown as Record<string, unknown>
    })

/**
 * 覆盖重写整个配置
 * schema 校验失败时异常直接上抛，由调用者处理
 */
const setAll = os
    .input(z.record(z.string(), z.unknown()))
    .output(z.boolean())
    .handler(async ({ input }) => {
        configService().setAll(input as any)
        return true
    })

/**
 * 获取单个配置项
 * 返回 unknown，由调用者自行断言类型
 */
const get = os
    .input(z.object({ key: z.string() }))
    .output(z.unknown())
    .handler(async ({ input }) => {
        const { key } = input
        return configService().get(key as any)
    })

/**
 * 设置单个配置项
 * schema 校验失败时异常直接上抛，由调用者处理
 */
const set = os
    .input(z.object({ key: z.string(), value: z.unknown() }))
    .output(z.boolean())
    .handler(async ({ input }) => {
        const { key, value } = input
        configService().set(key as any, value as any)
        return true
    })


/**
 * 获取最近任务列表
 * schema 校验失败时异常直接上抛，由调用者处理
 */
const recents = os
    .input(z.union([z.boolean(), z.string()]).optional())
    .output(z.array(recentProjectSchema))
    .handler(async ({ input }) => {
        if (typeof input === 'boolean' && input === true) {
            secondConfig().clearRecents();
        } else if (typeof input === 'string' && input.length > 0) {
            secondConfig().removeProject(input);
        }
        return secondConfig().recents;
    })

/**
 * 按 id 获取单个 MCP 服务器配置；不存在返回 null。
 */
const getMcpServer = os
    .input(z.string())
    .output(mcpServerConfigSchema.nullable())
    .handler(async ({ input }) => {
        return configService().getMcpServer(input) ?? null;
    })

/**
 * 按 id 新增或整体替换单个 MCP 服务器配置。
 */
const setMcpServer = os
    .input(mcpServerConfigSchema)
    .output(z.boolean())
    .handler(async ({ input }) => {
        configService().setMcpServer(input);
        return true;
    })

/**
 * 按 id 移除单个 MCP 服务器配置。
 * 指定 id 不存在时同样返回 true（幂等）。
 */
const removeMcpServer = os
    .input(z.string())
    .output(z.boolean())
    .handler(async ({ input }) => {
        configService().removeMcpServer(input);
        return true;
    })

/**
 * 读取当前系统是否启用了dark/light.
 */
const useDark = os
    .output(z.boolean())
    .handler(async () => {
        return nativeTheme.shouldUseDarkColorsForSystemIntegratedUI
    })

/**
 * 注：本地 GGUF 的嵌入 / 重排模型已下线，模型选择统一走 `models` 中的
 * 远程 Provider 能力声明，因此不再提供枚举本地模型目录的入口。
 */

const setheme = os
    .input(z.string())
    .output(z.string())
    .handler(async ({ input }) => {
        return setTheme(input);
    })


const resetheme = os
    .handler(async () => {
        resetTheme();
    })

const getheme = os
    .output(GetThemeSchema)
    .handler(async () => {
        return getTheme();
    })

const readData = os
    .input(z.string())
    .output(z.string().nullable())
    .handler(async ({ input }) => {
        return dataCenter.readFile(input);
    })

/**
 * 显式刷新 Embedding 派生状态。
 *
 * 客户端契约：先调用 set/get 写入 embed_model，再调用本方法。
 * 本方法会等待 Embedding 重建结束后返回（重建过程通过 task:update 广播进度，
 * 客户端据此渲染进度条，不要用本 RPC 的返回时机去推断进度）。
 */
const refreshEmbedding = os
    .output(z.boolean())
    .handler(async () => {
        await getGlobalEmbeddingService().refresh();
        return true;
    })

/**
 * 显式刷新 Rerank 派生状态。
 *
 * 客户端契约：先调用 set/get 写入 rerank_model，再调用本方法。
 * Rerank 只替换内部 op 缓存，不重建索引，因此没有长时任务进度。
 */
const refreshRerank = os
    .output(z.boolean())
    .handler(async () => {
        await getGlobalRerankService().refresh();
        return true;
    })

/**
 * 显式刷新 FTS 索引。
 *
 * 客户端契约：先调用 set/get 写入 fts_tokenizer，再调用本方法。
 * 本方法会等待全部表 FTS 索引重建结束后返回（过程通过 task:update 广播进度）。
 */
const refreshFtsIndexes = os
    .output(z.boolean())
    .handler(async () => {
        await recreateFtsIndexes();
        return true;
    })

export default {
    getAll,
    setAll,
    get,
    set,
    useDark,
    recents,
    getMcpServer,
    setMcpServer,
    removeMcpServer,
    setTheme: setheme,
    resetTheme: resetheme,
    getTheme: getheme,
    readData,
    refreshEmbedding,
    refreshRerank,
    refreshFtsIndexes
}