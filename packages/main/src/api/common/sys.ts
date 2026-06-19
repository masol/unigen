import { z } from 'zod'
import { os } from '@orpc/server'
import { app, BrowserWindow, dialog, shell } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join, basename, extname } from 'path'
import { FileFilterPreset, FileReturnMode } from '$types/shared/api.js'
import { RpcContext } from '../type.js'
import { listModels } from '$libs/utils/model/list.js'
import Logger from 'electron-log/main'
// import Logger from 'electron-log/main.js'

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

const fileReturnModeSchema = z.enum(FileReturnMode).optional()

const saveResultSchema = z.object({
    success: z.boolean(),
    canceled: z.boolean().optional(),
    filePath: z.string().optional(),
})

const openFileResultSchema = z.object({
    success: z.boolean(),
    canceled: z.boolean().optional(),
    /** FileReturnMode.CONTENT 时有值 */
    content: z.string().optional(),
    /** FileReturnMode.PATH 时有值；CONTENT + 二进制时也会附带 */
    filePath: z.string().optional(),
    /** 文件名 */
    fileName: z.string().optional(),
    /** 文件 MIME 类型推断 */
    mimeType: z.string().optional(),
})

// const openDirResultSchema = z.object({
//     success: z.boolean(),
//     canceled: z.boolean().optional(),
//     /** 选中的目录路径 */
//     dirPath: z.string().optional(),
// })

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

/** 通过扩展名简单推断 MIME */
function inferMimeType(filePath: string): string {
    const ext = extname(filePath).toLowerCase().replace('.', '')
    const map: Record<string, string> = {
        // text
        json: 'application/json', txt: 'text/plain', md: 'text/markdown',
        csv: 'text/csv', xml: 'application/xml', yaml: 'text/yaml',
        yml: 'text/yaml', html: 'text/html', css: 'text/css',
        js: 'application/javascript', ts: 'application/typescript',
        toml: 'application/toml', ini: 'text/plain', log: 'text/plain',
        // image
        png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp',
        svg: 'image/svg+xml', ico: 'image/x-icon', avif: 'image/avif',
        // video
        mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
        avi: 'video/x-msvideo', mov: 'video/quicktime', flv: 'video/x-flv',
        wmv: 'video/x-ms-wmv', m4v: 'video/x-m4v',
        // audio
        mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
        flac: 'audio/flac', aac: 'audio/aac', m4a: 'audio/mp4', wma: 'audio/x-ms-wma',
        // other
        pdf: 'application/pdf',
    }
    return map[ext] ?? 'application/octet-stream'
}

/** 判断是否为文本 MIME */
function isTextMime(mime: string): boolean {
    return (
        mime.startsWith('text/') ||
        mime === 'application/json' ||
        mime === 'application/xml' ||
        mime === 'application/javascript' ||
        mime === 'application/typescript' ||
        mime === 'application/toml'
    )
}

// ─── RPC 接口 ─────────────────────────────────────────────────
const dialogOpenSet = new Set<number>()

async function withModalWindow<T>(
    context: Record<string, unknown>,
    fn: (parent: BrowserWindow) => Promise<T>,
): Promise<T> {
    const ctx = context as RpcContext;
    const parent = BrowserWindow.fromId(ctx?.project?.wid)
    if (!parent) {
        throw new Error("无法定位当前窗口！")
    }

    if (dialogOpenSet.has(parent.id)) {
        throw new Error(`Window ${parent.id} already has a modal dialog open`)
    }
    dialogOpenSet.add(parent.id)
    parent.setEnabled(false)

    try {
        return await fn(parent)
    } finally {
        parent.setEnabled(true)
        parent.focus()
        dialogOpenSet.delete(parent.id)
    }
}
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
            defaultName: z.string().optional().default('untitled.json'),
            filters: filtersInputSchema,
        }),
    )
    .output(saveResultSchema)
    .handler(async ({ input, context }) => {
        const { data, defaultName, filters } = input
        const resolvedFilters = resolveFilters(filters) ?? [{ name: 'All Files', extensions: ['*'] }]

        const { canceled, filePath } = await withModalWindow(context, (parent) => {
            return dialog.showSaveDialog(parent, {

                defaultPath: defaultName,
                filters: resolvedFilters,
                properties: ['showOverwriteConfirmation'],
            })
        })

        if (canceled || !filePath) {
            return { success: false, canceled: true }
        }

        await writeFile(filePath, data, 'utf-8')
        return { success: true, canceled: false, filePath }
    })

/**
 * 保存二进制文件（base64 输入）
 */
const saveBinaryFile = os
    .input(
        z.object({
            /** base64 编码的数据（不含 data-uri 前缀） */
            base64: z.string(),
            defaultName: z.string().optional().default('untitled.bin'),
            filters: filtersInputSchema,
        }),
    )
    .output(saveResultSchema)
    .handler(async ({ input, context }) => {
        const { base64, defaultName, filters } = input
        const resolvedFilters = resolveFilters(filters) ?? [{ name: 'All Files', extensions: ['*'] }]

        const { canceled, filePath } = await withModalWindow(context, (parent) => {
            return dialog.showSaveDialog(parent, {
                defaultPath: defaultName,
                filters: resolvedFilters,
                properties: ['showOverwriteConfirmation'],
            });
        })

        if (canceled || !filePath) {
            return { success: false, canceled: true }
        }

        const buffer = Buffer.from(base64, 'base64')
        await writeFile(filePath, buffer)
        return { success: true, canceled: false, filePath }
    })

/**
 * 打开 / 读取文件
 *
 * **最佳实践**：
 * | 文件类型 | 推荐 returnMode | 渲染进程使用方式 |
 * |---------|----------------|----------------|
 * | JSON/文本 | `content` | 直接使用字符串 |
 * | 小图片 (<5 MB) | `content` | 获得 data-URI，赋值 `<img src>` |
 * | 大图片 / 视频 / 音频 | `path` | 拿到路径后拼 custom protocol：`app-file:///absolute/path`，赋给 `<img>/<video>/<audio> src` |
 *
 * > 视频 / 音频务必使用 `path` 模式 + custom protocol，
 * > 这样 Chromium 可以 **Range 请求**（拖动进度条），不会一次性加载到内存。
 */
const openFile = os
    .input(
        z.object({
            filters: filtersInputSchema,
            /** 默认 content；大文件建议用 path */
            returnMode: fileReturnModeSchema,
            /** 是否允许多选（暂只取第一个） */
            multiSelect: z.boolean().optional().default(false),
        }),
    )
    .output(openFileResultSchema)
    .handler(async ({ input, context }) => {
        const { filters, returnMode = FileReturnMode.CONTENT, multiSelect } = input
        const resolvedFilters = resolveFilters(filters) ?? [{ name: 'All Files', extensions: ['*'] }]

        const properties: Electron.OpenDialogOptions['properties'] = ['openFile']
        if (multiSelect) properties.push('multiSelections')

        const { canceled, filePaths } = await withModalWindow(context, (parent) => {
            return dialog.showOpenDialog(parent, {
                filters: resolvedFilters,
                properties,
            });
        })

        if (canceled || filePaths.length === 0) {
            return { success: false, canceled: true }
        }

        const filePath = filePaths[0]
        const fileName = basename(filePath)
        const mimeType = inferMimeType(filePath)

        // ── PATH 模式：只返回路径 ──
        if (returnMode === FileReturnMode.PATH) {
            return { success: true, canceled: false, filePath, fileName, mimeType }
        }

        // ── CONTENT 模式 ──
        if (isTextMime(mimeType)) {
            // 文本类：utf-8 字符串
            const content = await readFile(filePath, 'utf-8')
            return { success: true, canceled: false, content, filePath, fileName, mimeType }
        }

        // 二进制类：转 data-URI（小图片可用，大文件不推荐但尊重调用者选择）
        const buffer = await readFile(filePath)
        const base64 = buffer.toString('base64')
        const content = `data:${mimeType};base64,${base64}`
        return { success: true, canceled: false, content, filePath, fileName, mimeType }
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
        return true
    })

const listmodel = os
    .input(z.object({ baseURL: z.string(), apiKey: z.string() }))
    .output(z.array(z.record(z.string(), z.any())))
    .handler(async ({ input }) => {
        return await listModels(input.baseURL, input.apiKey)
    })



const getPath = os
    .input(z.object({ name: z.string(), sub: z.array(z.string()).optional(), create: z.boolean().optional() }))
    .output(z.string())
    .handler(async ({ input }) => {
        const dataPath = app.getPath("userData");
        let basePath;
        switch (input.name) {
            case 'llm':
                basePath = join(dataPath, "models", "llm", ...input.sub ?? [])
                break;
            case 'embeding':
                basePath = join(dataPath, "models", "embeding", ...input.sub ?? [])
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
            await mkdir(basePath, { recursive: true })
        }
        return basePath;
    })

// ─── 导出 ─────────────────────────────────────────────────────

export default {
    saveFile,
    saveBinaryFile,
    openFile,
    openExternal,
    openPath,
    showItemInFolder,
    listmodel,
    getPath
}