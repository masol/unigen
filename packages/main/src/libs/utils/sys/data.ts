import { app } from 'electron';
import Logger from 'electron-log/main.js';
import { pathExists } from 'fs-extra';
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

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
}

// 直接实例化并导出
export const dataCenter = new DataCenter();