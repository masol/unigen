import { z } from 'zod'
import { os } from '@orpc/server'
import { app, dialog, shell } from 'electron'
import { ensureDir } from 'fs-extra'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { listModels } from '$libs/utils/model/list.js'
import Logger from 'electron-log/main'
import { Hook, LogMessage, Transport } from 'electron-log'
import { WindowService } from '$libs/utils/window.js'
import { FileFilterPreset } from '$types/shared/api/sys.js'
import { embedingPath, rerankPath } from '$libs/utils/sys/dir.js'
// import { genText } from '$libs/utils/model/factory/node-llama-cpp/local.js'
import { throwCancel } from '$libs/utils/err.js'

// ─── Zod Schemas ─────────────────────────────────────────────
const fileFilterPresetSchema = z.enum(FileFilterPreset)

const customFilterSchema = z.object({
    name: z.string(),
    extensions: z.array(z.string()),
})

/**
 * filters 字段：可以传预置枚举，也可以传自定义 filter 数组，也可以不传（默认 ALL）
 */
const filtersInputSchema = z.union([
    fileFilterPresetSchema,
    z.array(customFilterSchema),
]).optional()

// const fileReturnModeSchema = z.enum(FileReturnMode).optional()

const saveResultSchema = z.object({
    success: z.boolean(),
    canceled: z.boolean().optional(),
    filePath: z.string().optional(),
})

// ─── 工具函数 ─────────────────────────────────────────────────

/** 预置 → Electron FileFilter[] */
function resolveFilters(
    input?: FileFilterPreset | { name: string; extensions: string[] }[],
): Electron.FileFilter[] | undefined {
    if (!input) return undefined
    if (Array.isArray(input)) return input

    const map: Record<FileFilterPreset, Electron.FileFilter[]> = {
        [FileFilterPreset.JSON]: [{ name: 'JSON', extensions: ['json'] }],
        [FileFilterPreset.TEXT]: [{ name: 'Text', extensions: ['txt', 'log', 'md', 'csv', 'xml', 'yaml', 'yml', 'toml', 'ini', 'conf'] }],
        [FileFilterPreset.IMAGE]: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'avif'] }],
        [FileFilterPreset.VIDEO]: [{ name: 'Videos', extensions: ['mp4', 'webm', 'mkv', 'avi', 'mov', 'flv', 'wmv', 'm4v'] }],
        [FileFilterPreset.AUDIO]: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'] }],
        [FileFilterPreset.MARKDOWN]: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
        [FileFilterPreset.CSV]: [{ name: 'CSV', extensions: ['csv', 'tsv'] }],
        [FileFilterPreset.PDF]: [{ name: 'PDF', extensions: ['pdf'] }],
        [FileFilterPreset.DOC]: [{ name: 'Documents', extensions: ['pdf', 'txt', 'doc', 'docx', 'md', 'rtf', 'odt'] }],
        [FileFilterPreset.ALL]: [{ name: 'All Files', extensions: ['*'] }],
    }
    return map[input] ?? undefined
}

// ─── RPC 接口 ─────────────────────────────────────────────────

/**
 * 打开文件
 * - filters: 可选的文件类型过滤
 */
const openFile = os
    .input(
        z.object({
            multi: z.boolean().optional(),
            showHiddenFiles: z.boolean().optional(),
            directory: z.boolean().optional(),
            filters: filtersInputSchema,
        }),
    )
    .output(z.array(z.string()))
    .handler(async ({ input, context }) => {
        const { filters, multi, showHiddenFiles, directory } = input
        const resolvedFilters = resolveFilters(filters) ?? [{ name: 'All Files', extensions: ['*'] }]

        const { canceled, filePaths } = await WindowService.instance.withModalWindow(context, (parent) => {
            const props: Array<"showHiddenFiles" | "openFile" | "openDirectory" | "multiSelections" | "createDirectory" | "promptToCreate" | "noResolveAliases" | "treatPackageAsDirectory" | "dontAddToRecent"> = [];
            if (multi) {
                props.push('multiSelections')
            }
            if (showHiddenFiles) {
                props.push('showHiddenFiles')
            }
            if (directory) {
                props.push('openDirectory')
            } else {
                props.push('openFile')
            }

            return dialog.showOpenDialog(parent, {
                filters: resolvedFilters,
                properties: ['dontAddToRecent', ...props],
            })
        })

        if (canceled) {
            throwCancel("用户取消");
        }

        return filePaths
    })



/**
 * 保存文件
 * - data: 要写入的字符串内容
 * - defaultName: 默认文件名
 * - filters: 可选的文件类型过滤
 */
const saveFile = os
    .input(
        z.object({
            data: z.string(),
            noDialog: z.boolean().optional(),
            defaultName: z.string().optional().default('untitled.json'),
            filters: filtersInputSchema,
        }),
    )
    .output(saveResultSchema)
    .handler(async ({ input, context }) => {
        const { data, defaultName, filters, noDialog } = input

        let writePath = defaultName;

        if (!noDialog) {
            const resolvedFilters = resolveFilters(filters) ?? [{ name: 'All Files', extensions: ['*'] }]

            const { canceled, filePath } = await WindowService.instance.withModalWindow(context, (parent) => {
                return dialog.showSaveDialog(parent, {

                    defaultPath: defaultName,
                    filters: resolvedFilters,
                    properties: ['showOverwriteConfirmation'],
                })
            })

            if (canceled || !filePath) {
                return { success: false, canceled: true }
            }
            writePath = filePath;
        }

        if (writePath && data) {
            await writeFile(writePath, data, 'utf-8')
            return { success: true, canceled: false, filePath: writePath }
        }
        return { success: false }
    })

/**
 * 保存二进制文件（base64 输入）
 */
const saveBinaryFile = os
    .input(
        z.object({
            /** base64 编码的数据（不含 data-uri 前缀） */
            base64: z.string(),
            noDialog: z.boolean().optional(),
            defaultName: z.string().optional().default('untitled.bin'),
            filters: filtersInputSchema,
        }),
    )
    .output(saveResultSchema)
    .handler(async ({ input, context }) => {
        const { base64, defaultName, filters, noDialog } = input


        let writePath = defaultName;
        if (!noDialog) {
            const resolvedFilters = resolveFilters(filters) ?? [{ name: 'All Files', extensions: ['*'] }]

            const { canceled, filePath } = await WindowService.instance.withModalWindow(context, (parent) => {
                return dialog.showSaveDialog(parent, {
                    defaultPath: defaultName,
                    filters: resolvedFilters,
                    properties: ['showOverwriteConfirmation'],
                });
            })

            if (canceled || !filePath) {
                return { success: false, canceled: true }
            }
            writePath = filePath;
        }

        if (writePath && base64) {
            const buffer = Buffer.from(base64, 'base64')
            await writeFile(writePath, buffer)
            return { success: true, canceled: false, filePath: writePath }
        }
        return { success: false }
    })

/**
 * 使用系统默认程序打开外部 URL（浏览器打开网址）
 */
const openExternal = os
    .input(z.object({ url: z.string().url() }))
    .output(z.boolean())
    .handler(async ({ input }) => {
        await shell.openExternal(input.url)
        return true
    })

/**
 * 使用系统默认程序打开本地文件（如用 Finder/Explorer 打开图片、PDF 等）
 */
const openPath = os
    .input(z.object({ path: z.string() }))
    .output(
        z.object({
            success: z.boolean(),
            errorMessage: z.string().optional(),
        }),
    )
    .handler(async ({ input }) => {
        const errorMessage = await shell.openPath(input.path)
        if (errorMessage) {
            Logger.error(`无法使用系统默认应用打开请求的文件：${input.path}`)
            return { success: false, errorMessage }
        }
        return { success: true }
    })

/**
 * 在文件管理器中显示 / 高亮文件
 */
const showItemInFolder = os
    .input(z.object({ path: z.string() }))
    .output(z.boolean())
    .handler(async ({ input }) => {
        shell.showItemInFolder(input.path)
        Logger.info(`使用系统资源管理器显示文件(目录):${input.path}`)
        return true
    })

const listmodel = os
    .input(z.object({ baseURL: z.string(), apiKey: z.string() }))
    .output(z.array(z.record(z.string(), z.any())))
    .handler(async ({ input }) => {
        return await listModels(input.baseURL, input.apiKey)
    })

const version = os
    .output(z.string())
    .handler(async () => {
        return __APP_VERSION__
    })


const getPath = os
    .input(z.object({ name: z.string(), sub: z.array(z.string()).optional(), create: z.boolean().optional() }))
    .output(z.string())
    .handler(async ({ input }) => {
        let basePath;
        switch (input.name) {
            case 'llm':
            case 'rerank':
                basePath = join(rerankPath(), ...input.sub ?? [])
                break;
            case 'embeding':
                basePath = join(embedingPath(), ...input.sub ?? [])
                break;
            case 'logs':
                return Logger.transports.file.getFile().path
            default:
                try {
                    // @ts-expect-error 无类型。
                    const tempPath = app.getPath(input.name);
                    basePath = join(tempPath, ...input.sub ?? [])
                } catch (e) {
                    void e;
                    return ""
                }
        }
        if (basePath && input.create) {
            await ensureDir(basePath)
        }
        return basePath;
    })



// 日志流 handler，在renderer/src/route/featured/bottom/hooklog/hoo-log.store.svelte.ts中使用。
const streamLogs = os
    .input(z.object({}).optional())
    .handler(async function* ({ context }) {
        // @ts-expect-error 不写类型定义了。
        const signal: AbortSignal | undefined = context?.signal;

        const queue: LogMessage[] = [];
        let resolveNext: (() => void) | null = null;

        // 日志拦截钩子
        const logHook: Hook = (message: LogMessage, transport?: Transport, transportName?: string) => {
            if (transportName === 'file') {
                // console.log("enter loghook:", message)
                queue.push(message);
                if (resolveNext) {
                    resolveNext();
                    resolveNext = null;
                }
            }
            return message;
        };
        Logger.hooks.push(logHook);

        // 清理钩子
        const cleanup = () => {
            const idx = Logger.hooks.indexOf(logHook);
            if (idx !== -1) Logger.hooks.splice(idx, 1);
        };

        // 提前取消直接退出
        if (signal?.aborted) {
            cleanup();
            return;
        }

        // 统一全局abort回调，只注册一次，不用循环内重复注册
        const onGlobalAbort = () => {
            cleanup();
        };
        signal?.addEventListener('abort', onGlobalAbort);

        try {
            while (!signal?.aborted) {
                if (queue.length > 0) {
                    yield queue.shift()!;
                } else {
                    // 等待新日志
                    await new Promise<void>((resolve) => {
                        resolveNext = resolve;
                        // 统一复用同一个handler，保证能remove
                        const onWaitAbort = () => resolve();
                        signal?.addEventListener('abort', onWaitAbort);

                        // Promise结束自动移除监听，无需外层判断
                        resolveNext = () => {
                            signal?.removeEventListener('abort', onWaitAbort);
                            resolve();
                        };
                    });
                }
            }
        } finally {
            // 兜底全部清理
            cleanup();
            signal?.removeEventListener('abort', onGlobalAbort);
            // console.log("quit logstream...")
        }
    });



// const genTextApi = os
//     .input(z.string())
//     .output(z.string())
//     .handler(async ({ input }) => {
//         return await genText(input)
//     })


export default {
    openFile,
    saveFile,
    saveBinaryFile,
    openExternal,
    openPath,
    showItemInFolder,
    listmodel,
    getPath,
    streamLogs,
    version
}