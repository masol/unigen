import { type ProjectType } from '$types/shared/template/prjtype.js';
import { app } from 'electron';
import Logger from 'electron-log/main.js';
import { pathExists } from 'fs-extra';
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { throwUnprcessable } from '../err.js';
import { knowledgeCenter } from '../kc.js';

const DataDirName = 'data';

/**
 * 全局数据中心。优先读取 userData/data 下的可写文件，
 * 不存在时回退到发行包自带的 resources/data 只读资源。
 */
class DataCenter {
    /** 可写扩展的数据目录（对外暴露），优先级高，覆盖 resource 同名文件 */
    public readonly dataPath: string;
    /** 发行包自带的只读资源根目录，优先级低 */
    public readonly resourcePath: string;

    /** 模板元信息缓存，null 表示尚未加载 */
    private tplMetas: ProjectType[] | null = null;

    constructor() {
        this.dataPath = join(app.getPath('userData'), DataDirName);

        if (app.isPackaged) {
            // 生产环境：resources 下的 data（只读初始）
            this.resourcePath = join(process.resourcesPath, DataDirName);
        } else {
            // 开发环境：直接指向源码目录，二者一致，方便动态更新
            // 当前文件位于 dist，向上一级到项目根目录
            const __dirname = dirname(fileURLToPath(import.meta.url));
            this.resourcePath = join(__dirname, '..', DataDirName);
        }
    }

    public findType(type: string): ProjectType | null {
        if (!type) return null;
        return this.tplMetas?.find((tpl) => tpl.id == type) || null;
    }

    /**
     * 返回插件（type）对应的目录路径。
     * 现在插件存放在 knowledge 目录下，以子目录形式组织。
     */
    public typePath(...args: string[]): string {
        return join(knowledgeCenter.kcPath, ...args);
    }

    public async readPrompt(...args: string[]): Promise<string | null> {
        const parts = [...args];
        if (parts.length > 0) {
            const lastIndex = parts.length - 1;
            parts[lastIndex] = parts[lastIndex] + '.md';
        }
        return await this.readFile('prompt', ...parts);
    }

    public async ensurePrompt(...args: string[]): Promise<string> {
        const prompt = await this.readPrompt(...args);
        if (!prompt) {
            throwUnprcessable(`未找到系统提示文件: ${args.join('/')}.md`);
        }
        return prompt;
    }

    /**
     * 以文本形式读取 data 目录下的文件。
     * - 优先读取 userData/data 下的同名文件；
     * - 不存在时回退到 resources/data；
     * - 任何异常（文件不存在、读取失败等）均返回 null，不抛异常。
     *
     * @param relativePath 相对 data 目录的相对路径（含文件名）
     * @returns 文件文本内容，读取失败返回 null
     */
    public async readFile(...args: string[]): Promise<string | null> {
        // 顺序即优先级：userData 高，resource 低
        const candidates: string[] = [
            join(this.dataPath, ...args),
            join(this.resourcePath, ...args),
        ];

        for (const fullPath of candidates) {
            try {
                if (!(await pathExists(fullPath))) {
                    continue;
                }
                return await readFile(fullPath, 'utf-8');
            } catch (error) {
                Logger.warn('[DataCenter] 读取失败，跳过', fullPath, error);
            }
        }

        return null;
    }

    /**
     * 加载模板元信息（ProjectType）。
     *
     * 现在从 KnowledgeCenter 的插件系统中加载，
     * 每个同时具有 type.json 和 entry.json 的子目录即为一个插件。
     *
     * @param bForce 为 false 且缓存有效时直接返回缓存；为 true 强制重新加载
     * @returns 去重后的 ProjectType 数组
     */
    public async loadTplMetas(bForce: boolean = false): Promise<ProjectType[]> {
        if (!bForce && this.tplMetas !== null) {
            return this.tplMetas;
        }

        this.tplMetas = await knowledgeCenter.loadPlugins(bForce);

        Logger.log(`[DataCenter] loadTplMetas：共加载 ${this.tplMetas.length} 个模板`);

        return this.tplMetas;
    }
}

const KEY = Symbol.for('unigen.singleton.dataCenter');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const dataCenter: DataCenter = ((globalThis as any)[KEY] ??= new DataCenter());