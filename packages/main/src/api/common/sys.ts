import { listModels } from '$libs/model/list.js'
import { embedingPath, rerankPath } from '$libs/utils/sys/dir.js'
import { WindowService } from '$libs/utils/window.js'
import { FileFilterPreset } from '$types/shared/api/sys.js'
import { os } from '@orpc/server'
import type { OpenDialogOptions } from 'electron'
import { app, dialog, shell } from 'electron'
import { Hook, LogMessage, Transport } from 'electron-log'
import Logger from 'electron-log/main'
import { ensureDir } from 'fs-extra'
import { writeFile } from 'fs/promises'
import { isAbsolute, join } from 'path'
import { z } from 'zod'
// import { genText } from '$libs/utils/model/factory/node-llama-cpp/local.js'
import { configService } from '$libs/store/index.js'
import { throwCancel } from '$libs/utils/err.js'
import { knowledgeCenter } from '$libs/utils/kc.js'
import { dataCenter } from '$libs/utils/sys/data.js'
import { nextIncrementalName } from '$libs/utils/sys/fs.js'
import { appLife } from '$libs/utils/tapable/applife.js'
import { projectTypeSchema } from '$types/shared/template/prjtype.js'
import pTimeout from 'p-timeout'
import type { RpcContext } from '../type.js'

// ─── Zod Schemas ─────────────────────────────────────────────
const fileFilterPresetSchema = z.enum(FileFilterPreset)

const customFilterSchema = z.object({
    name: z.string(),
    extensions: z.array(z.string()),
})

/**
 * filters 字段:可以传预置枚举,也可以传自定义 filter 数组,也可以不传(默认 ALL)
 */
const filtersInputSchema = z.union([
    fileFilterPresetSchema,
    z.array(customFilterSchema),
]).optional()

type FiltersInput = z.infer<typeof filtersInputSchema>

const dialogInputBaseSchema = z.object({
    title: z.string().optional(),
    defaultPath: z.string().optional(),
    buttonLabel: z.string().optional(), // Custom label for the confirmation button, when left empty the default label will be used.
    message: z.string().optional(), // Message to display above input boxes.
})

type DialogInputBase = z.infer<typeof dialogInputBaseSchema>

const openFileInputSchema = dialogInputBaseSchema.extend({
    multi: z.boolean().optional(),
    showHiddenFiles: z.boolean().optional(),
    directory: z.boolean().optional(),
    filters: filtersInputSchema,
})

const selectDirectoryInputSchema = dialogInputBaseSchema

const saveFileInputSchema = dialogInputBaseSchema.extend({
    data: z.string(),
    noDialog: z.boolean().optional(),
    defaultName: z.string().optional().default('untitled.json'),
    filters: filtersInputSchema,
})

const saveBinaryFileInputSchema = dialogInputBaseSchema.extend({
    /** base64 编码的数据(不含 data-uri 前缀) */
    base64: z.string(),
    noDialog: z.boolean().optional(),
    defaultName: z.string().optional().default('untitled.bin'),
    filters: filtersInputSchema,
})

const saveResultSchema = z.object({
    success: z.boolean(),
    canceled: z.boolean().optional(),
    filePath: z.string().optional(),
})

// ─── 工具函数 ─────────────────────────────────────────────────

/** 预置 → Electron FileFilter[] */
function resolveFilters(input?: FiltersInput): Electron.FileFilter[] | undefined {
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

function resolveFiltersOrDefault(input?: FiltersInput): Electron.FileFilter[] {
    return resolveFilters(input) ?? [{ name: 'All Files', extensions: ['*'] }]
}

type DialogOptions = Pick<OpenDialogOptions, 'title' | 'defaultPath' | 'buttonLabel' | 'message'>

function buildDialogOptions(input?: DialogInputBase): DialogOptions {
    const opts: DialogOptions = {}
    if (input?.title !== undefined) {
        opts.title = input.title
    }
    if (input?.buttonLabel !== undefined) {
        opts.buttonLabel = input.buttonLabel
    }
    if (input?.defaultPath !== undefined) {
        opts.defaultPath = input.defaultPath
    }
    if (input?.message !== undefined) {
        opts.message = input.message
    }
    return opts
}

type SavePathInput = DialogInputBase & {
    noDialog?: boolean
    defaultName: string
    filters?: FiltersInput
}

async function selectSavePath(
    context: RpcContext,
    input: SavePathInput,
): Promise<{ canceled: true } | { canceled: false; filePath: string }> {
    if (input.noDialog) {
        return { canceled: false, filePath: input.defaultName }
    }

    const { canceled, filePath } = await WindowService.instance.withModalWindow(context, (parent) => {
        return dialog.showSaveDialog(parent, {
            ...buildDialogOptions(input),
            defaultPath: input.defaultPath ?? input.defaultName,
            filters: resolveFiltersOrDefault(input.filters),
            properties: ['showOverwriteConfirmation'],
        })
    })

    if (canceled || !filePath) {
        return { canceled: true }
    }

    return { canceled: false, filePath }
}

// ─── RPC 接口 ─────────────────────────────────────────────────

/**
 * 打开文件
 * - filters: 可选的文件类型过滤
 */
const openFile = os
    .input(openFileInputSchema)
    .output(z.array(z.string()))
    .handler(async ({ input, context }) => {
        const { filters, multi, showHiddenFiles, directory } = input
        const resolvedFilters = resolveFiltersOrDefault(filters)

        const { canceled, filePaths } = await WindowService.instance.withModalWindow(context, (parent) => {
            const props: NonNullable<OpenDialogOptions['properties']> = []
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
                ...buildDialogOptions(input),
                filters: resolvedFilters,
                properties: ['dontAddToRecent', ...props],
            })
        })

        if (canceled) {
            throwCancel("用户取消")
        }

        return filePaths
    })

/**
 * 选择单个目录
 * - defaultPath: 对话框打开时定位到该目录
 * - title:       对话框标题(部分平台生效)
 * 返回 { canceled, path },取消时 path 为 undefined。
 */
const selectDirectory = os
    .input(selectDirectoryInputSchema.optional())
    .output(
        z.object({
            canceled: z.boolean(),
            path: z.string().optional(),
        }),
    )
    .handler(async ({ input, context }) => {
        const { canceled, filePaths } = await WindowService.instance.withModalWindow(context, (parent) => {
            return dialog.showOpenDialog(parent, {
                ...buildDialogOptions(input),
                properties: ['openDirectory', 'createDirectory', 'dontAddToRecent'],
            })
        })

        if (canceled || filePaths.length === 0) {
            return { canceled: true }
        }

        return { canceled: false, path: filePaths[0] }
    })

/**
 * 保存文件
 * - data: 要写入的字符串内容
 * - defaultName: 默认文件名
 * - filters: 可选的文件类型过滤
 */
const saveFile = os
    .input(saveFileInputSchema)
    .output(saveResultSchema)
    .handler(async ({ input, context }) => {
        const { data } = input
        const savePath = await selectSavePath(context as RpcContext, input)

        if (savePath.canceled) {
            return { success: false, canceled: true }
        }

        if (savePath.filePath && data) {
            await writeFile(savePath.filePath, data, 'utf-8')
            return { success: true, canceled: false, filePath: savePath.filePath }
        }
        return { success: false }
    })

/**
 * 保存二进制文件(base64 输入)
 */
const saveBinaryFile = os
    .input(saveBinaryFileInputSchema)
    .output(saveResultSchema)
    .handler(async ({ input, context }) => {
        const { base64 } = input
        const savePath = await selectSavePath(context as RpcContext, input)

        if (savePath.canceled) {
            return { success: false, canceled: true }
        }

        if (savePath.filePath && base64) {
            const buffer = Buffer.from(base64, 'base64')
            await writeFile(savePath.filePath, buffer)
            return { success: true, canceled: false, filePath: savePath.filePath }
        }
        return { success: false }
    })

/**
 * 使用系统默认程序打开外部 URL(浏览器打开网址)
 */
const openExternal = os
    .input(z.object({ url: z.string().url() }))
    .output(z.boolean())
    .handler(async ({ input }) => {
        await shell.openExternal(input.url)
        return true
    })

/**
 * 使用系统默认程序打开本地文件(如用 Finder/Explorer 打开图片、PDF 等)
 */
const OPEN_TIMEOUT_MS = 10_000 // 10秒超时

const openPath = os
    .input(z.object({ path: z.string(), timeout: z.number().optional() }))
    .output(
        z.object({
            success: z.boolean(),
            errorMessage: z.string().optional(),
        }),
    )
    .handler(async ({ input }) => {
        try {
            const errorMessage = await pTimeout(
                shell.openPath(input.path),
                {
                    milliseconds: input.timeout ?? OPEN_TIMEOUT_MS,
                    message: `打开文件超时: ${input.path}`,
                },
            )
            if (errorMessage) {
                Logger.error(`无法使用系统默认应用打开请求的文件:${input.path}, 错误: ${errorMessage}`)
                return { success: false, errorMessage }
            }
            return { success: true }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            Logger.error(`打开文件异常:${input.path}, ${message}`)
            return { success: false, errorMessage: message }
        }
    })

/**
 * 在文件管理器中显示 / 高亮文件
 */
const showItemInFolder = os
    .input(z.object({ path: z.union([z.string(), z.array(z.string())]) }))
    .output(z.boolean())
    .handler(async ({ input, context }) => {
        const ctx = context as RpcContext
        const path = Array.isArray(input.path) ? join(...input.path) : input.path
        const fullPath = isAbsolute(path) ? path : ctx.project.getPath(path)
        shell.showItemInFolder(fullPath)
        Logger.info(`使用系统资源管理器显示文件(目录):${fullPath}`)
        return true
    })

const listmodel = os
    .input(z.object({ baseURL: z.string(), apiKey: z.string() }))
    .output(z.array(z.record(z.string(), z.any())))
    .handler(async ({ input }) => {
        return await listModels(input.baseURL, input.apiKey)
    })

const version = os
    .input(z.void())
    .output(z.string())
    .handler(async () => {
        return __APP_VERSION__
    })

const getPath = os
    .input(z.object({ name: z.string(), sub: z.array(z.string()).optional(), create: z.boolean().optional() }))
    .output(z.string())
    .handler(async ({ input }) => {
        let basePath
        switch (input.name) {
            case 'llm':
            case 'rerank':
                basePath = join(rerankPath(), ...(input.sub ?? []))
                break
            case 'embeding':
                basePath = join(embedingPath(), ...(input.sub ?? []))
                break
            case 'kc':
                basePath = knowledgeCenter.kcPath
                break
            case 'logs':
                return Logger.transports.file.getFile().path
            default:
                try {
                    // @ts-expect-error 无类型。
                    const tempPath = app.getPath(input.name)
                    basePath = join(tempPath, ...(input.sub ?? []))
                } catch (e) {
                    void e
                    return ""
                }
        }
        if (basePath && input.create) {
            await ensureDir(basePath)
        }
        return basePath
    })

const streamLogs = os
    .input(z.object({}).optional())
    .handler(async function* ({ context, signal }) {
        // @ts-expect-error 不改进类型了。
        const externalSignal: AbortSignal | undefined = signal ?? context?.signal

        const queue: LogMessage[] = []
        let notifyWaiting: (() => void) | null = null

        const logHook: Hook = (message: LogMessage, transport?: Transport, transportName?: string) => {
            if (transportName === 'file') {
                queue.push(message)
                if (notifyWaiting) {
                    notifyWaiting()
                    notifyWaiting = null
                }
            }
            return message
        }
        Logger.hooks.push(logHook)

        const cleanup = () => {
            const idx = Logger.hooks.indexOf(logHook)
            if (idx !== -1) Logger.hooks.splice(idx, 1)
            if (notifyWaiting) {
                notifyWaiting()
                notifyWaiting = null
            }
        }

        const onAbort = () => cleanup()
        if (externalSignal?.aborted) return cleanup()
        externalSignal?.addEventListener('abort', onAbort)

        try {
            while (!externalSignal?.aborted) {
                if (queue.length > 0) {
                    yield queue.shift()!
                } else {
                    await new Promise<void>((resolve) => {
                        notifyWaiting = resolve
                    })
                }
            }
        } finally {
            cleanup()
            externalSignal?.removeEventListener('abort', onAbort)
            Logger.debug("logstream terminate successfully.", externalSignal)
        }
    })

const bootstrapped = os
    .input(z.void())
    .output(z.void())
    .handler(async () => {
        await appLife.bootstrapped.promise
    })

// 获取系统当前安装的所有项目类型。
const prjTypes = os
    .input(z.boolean().optional())
    .output(z.array(projectTypeSchema))
    .handler(async ({ input }) => {
        return dataCenter.loadTplMetas(input)
    })

const validTaskName = os
    .input(z.void())
    .output(z.string())
    .handler(async () => {
        return await nextIncrementalName(configService().get("task_dir"), "untitled")
    })

export default {
    openFile,
    selectDirectory,
    saveFile,
    saveBinaryFile,
    openExternal,
    openPath,
    showItemInFolder,
    listmodel,
    getPath,
    streamLogs,
    version,
    bootstrapped,
    prjTypes,
    validTaskName
}