/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod'
import { os } from '@orpc/server'
import { configService } from '$libs/store/index.js'
import { app, nativeTheme } from 'electron'
import { basename, join } from 'path'
import FastGlob from 'fast-glob'
import { ensureDir } from 'fs-extra'
import { secondConfig } from '$libs/store/second.js'

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
 * 获取最近项目列表
 * schema 校验失败时异常直接上抛，由调用者处理
 */
const recents = os
    .output(z.array(z.object({
        path: z.string(),
        time: z.number()
    })))
    .handler(async () => {
        return secondConfig().recents;
    })

/**
 * 读取当前系统是否启用了dark/light.
 */
const useDark = os
    .output(z.boolean())
    .handler(async () => {
        return nativeTheme.shouldUseDarkColorsForSystemIntegratedUI
    })

async function getModels(sub: string): Promise<Array<{ value: string, label: string }>> {
    const dataPath = app.getPath("userData");
    const basepath = join(dataPath, "models", sub);
    await ensureDir(basepath);
    const files = await FastGlob(FastGlob.convertPathToPattern(basepath) + '/**/*.gguf', {
        absolute: true
    })
    return files.map(f => {
        return {
            value: f,
            label: basename(f)
        }
    })
}

const getEmbedings = os
    .output(z.array(z.object({
        value: z.string(),
        label: z.string()
    })))
    .handler(async () => {
        return getModels("embeding");
    })

const getllms = os
    .output(z.array(z.object({
        value: z.string(),
        label: z.string()
    })))
    .handler(async () => {
        return getModels("llm");
    })

export default {
    getAll,
    setAll,
    get,
    set,
    useDark,
    getEmbedings,
    getllms,
    recents
}