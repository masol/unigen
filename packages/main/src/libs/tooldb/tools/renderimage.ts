import { getSmartImage } from "$libs/model/index.js";
import { getRunnerContext } from "$libs/project/controllers/runner.js";
import { generateImage } from "ai";
import Logger from "electron-log/main.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "../type.js";

/**
 * 把用户给出的相对路径解析为绝对路径(基于当前任务目录);
 * 已是绝对路径的原样返回。
 */
function resolveProjectPath(p: string): string {
    if (path.isAbsolute(p)) return p;
    return path.join(getRunnerContext().prj.path, p);
}

/**
 * outputPath 通常由 AI 生成。
 * 若 AI 传入绝对路径,去掉根后视为相对当前任务目录的路径,
 * 避免把文件直接写到项目目录之外。
 */
function stripOutputPathRoot(p: string): string {
    if (!path.isAbsolute(p)) return p;
    const root = path.parse(p).root;
    return p.slice(root.length).replace(/^[/\\]+/, "");
}

/**
 * 解析 outputPath 的实际落盘路径。
 * 绝对路径会被去掉根并当作相对路径处理;最终路径可能因此变化。
 */
function resolveOutputPath(p: string): string {
    const relative = stripOutputPathRoot(p);
    if (!relative) {
        throw new Error(`outputPath 不能是文件系统根目录: ${p}`);
    }
    return path.join(getRunnerContext().prj.path, relative);
}

// ─────────────────────────────────────────────────────────────
// Tool 定义
// ─────────────────────────────────────────────────────────────

const inputSchema = z.object({
    prompt: z
        .string()
        .min(1)
        .describe(
            "图像生成提示词,用自然语言描述想要生成的画面内容(主体、构图、风格、色彩、文字等)。" +
            "所有需要出现在画面上的文字都应在提示词中明确给出,由图像模型直接绘制。",
        ),
    outputPath: z
        .string()
        .min(1)
        .describe(
            "图片保存的预期路径,可传相对或绝对路径(例如 'imgs/hero.jpg')。" +
            "该路径仅用于写文件,可能被规范化,且不可用于向用户展示图片。" +
            "展示图片请使用返回的 absolutePath。父目录会自动创建;扩展名建议 .jpg 或 .png。",
        ),
    width: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("输出图像宽度,像素。默认 1024。"),
    height: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("输出图像高度,像素。默认 1024。"),
    referenceImages: z
        .array(z.string())
        .optional()
        .describe(
            "参考图路径列表(相对或绝对),用于让模型保持特定主体(如产品形态、品牌 logo、人物面貌)的外观一致。" +
            "参考图优先级高于提示词文字描述:两者冲突时,画面以参考图为准。",
        ),
    seed: z
        .number()
        .int()
        .optional()
        .describe("随机种子。相同 seed + 相同参数可复现同一结果;不传则自动生成并在返回值中给出。"),
});

const outputSchema = z.object({
    /** 用户原始传入的路径(保持其相对/绝对形式),便于回显;最终落盘位置以 absolutePath 为准 */
    filePath: z
        .string()
        .describe("调用方传入的原始 outputPath,仅供日志/回显,禁止用于向用户展示图片。"),
    /** 实际落盘的绝对路径 */
    absolutePath: z
        .string()
        .describe(
            "图片最终落盘的绝对路径。这是向用户展示/回链图片的唯一可用路径:" +
            "必须用它作为图片链接回应用户,不要使用传入的 outputPath。",
        ),
    width: z.number(),
    height: z.number(),
    seed: z.number(),
    /** 文件字节数 */
    byteSize: z.number(),
    /** 实际有效加载的参考图数量(路径无法读取的会被跳过) */
    referenceImageCount: z.number(),
});

type RenderImageInput = z.infer<typeof inputSchema>;
type RenderImageOutput = z.infer<typeof outputSchema>;

/**
 * 文生图工具:根据自然语言提示词生成图像并保存到指定路径。
 *
 * 使用要点:
 * - prompt 中直接写明画面上需要出现的文字,图像模型会在画面中绘制;
 * - referenceImages 用于锁定主体外观(如产品/品牌/人物),显著优于仅文字描述;
 * - 相同 seed + 相同参数可复现结果,便于迭代微调;
 * - 传入的 outputPath 仅用于写文件,不可用来展示;
 * - 向用户回图时,必须使用返回值中的 absolutePath 作为图片链接。
 */
export const renderImageTool: ToolDefinition<RenderImageInput, RenderImageOutput> = {
    name: "render_image",
    description:
        "根据自然语言提示词生成一张图像并保存到指定路径,可选传入参考图以保持主体(产品/品牌 logo/人物等)外观一致。" +
        "返回图片落盘绝对路径 absolutePath 与实际使用的 seed(便于复现)。" +
        "重要:向用户展示/回链图片时,只能使用返回的 absolutePath,不能使用传入的 outputPath;" +
        "outputPath 仅用于写文件,其路径可能被规范化,不代表真实位置。",
    inputSchema,
    outputSchema,
    execute: async ({ prompt, outputPath, width, height, referenceImages, seed }) => {
        const ctx = getRunnerContext();

        const w = width ?? 1024;
        const h = height ?? 1024;
        // 自己生成 seed 以便无论是否传入都能返回,方便上游复现
        const effectiveSeed =
            seed ?? Math.floor(Math.random() * 0x7fffffff);

        // 加载参考图,逐张容错(单张失败不影响整体)
        const refBytes: Uint8Array[] = [];
        for (const rel of referenceImages ?? []) {
            const abs = resolveProjectPath(rel);
            try {
                refBytes.push(await readFile(abs));
            } catch (err) {
                Logger.warn(
                    `[render_image] 参考图读取失败,已跳过: ${abs} (${(err as Error).message})`,
                );
            }
        }

        // AI SDK 的 prompt 既可以是纯文本,也可以是 { images, text } 多模态结构
        const promptInput =
            refBytes.length > 0 ? { images: refBytes, text: prompt } : prompt;

        const { image } = await generateImage({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            model: getSmartImage(undefined, ctx as any),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            prompt: promptInput as any,
            size: `${w}x${h}` as `${number}x${number}`,
            seed: effectiveSeed,
            n: 1,
        });

        const absPath = resolveOutputPath(outputPath);
        await mkdir(path.dirname(absPath), { recursive: true });
        await writeFile(absPath, image.uint8Array);

        Logger.info(
            `[render_image] 已生成 ${absPath} ` +
            `(${image.uint8Array.length} bytes, ${w}x${h}, seed=${effectiveSeed}, ` +
            `${refBytes.length} 参考图)`,
        );

        return {
            filePath: outputPath,
            absolutePath: absPath,
            width: w,
            height: h,
            seed: effectiveSeed,
            byteSize: image.uint8Array.length,
            referenceImageCount: refBytes.length,
        };
    },
};