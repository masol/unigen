import { app } from 'electron';
import Logger from 'electron-log/main.js';
import { copy, ensureDir, pathExists } from 'fs-extra';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * 全局知识中心。支持从训练好的项目中导出知识，下次新建此类项目时，自动初始化其知识中心。
 * @todo: 项目隔离，是对逻辑向AI自学习能力信心不足，如果有稳定收敛判定机制，项目可以直接使用全局知识中心，无需每项隔离。
 */
class KnowledgeCenter {
    /** 知识中心的根目录（对外暴露） */
    public readonly fullPath: string;
    public isInitialized: boolean = false;

    constructor() {
        // 对外暴露的 knowledge 根目录
        if (app.isPackaged) {
            // 生产环境：userData 下的 knowledge 目录（可写）
            this.fullPath = join(app.getPath('userData'), 'knowledge');
        } else {
            // 开发环境：直接指向源码目录，方便动态更新
            // 当前文件位于 dist，向上一级到项目根目录
            const __dirname = dirname(fileURLToPath(import.meta.url));
            this.fullPath = join(__dirname, '../knowledge');
        }
    }

    /**
     * 获取 knowledge 根目录下的子路径
     * 用法： knowledgeCenter.subPath('docs', 'a.md')
     */
    public subPath(...paths: string[]): string {
        return join(this.fullPath, ...paths);
    }

    /**
     * 初始化知识中心
     * - 开发模式：不拷贝，直接使用源码目录下的 knowledge
     * - 生产模式：如果 userData/knowledge 不存在，则从 resources/knowledge 拷贝一份
     */
    public async init(): Promise<void> {
        if (this.isInitialized) return;

        try {
            if (!app.isPackaged) {
                Logger.log('[KnowledgeCenter] 开发模式：使用源码目录，跳过拷贝', this.fullPath);
                this.isInitialized = true;
                return;
            }

            // 打包后的只读源目录（仅在生产模式初始化时使用）
            const sourceDir: string = join(process.resourcesPath, 'knowledge');

            const exists: boolean = await pathExists(this.fullPath);

            // 生产模式下：目标目录不存在，说明是首次启动，执行拷贝
            if (!exists) {
                await ensureDir(this.fullPath);

                const sourceExists: boolean = await pathExists(sourceDir);
                if (sourceExists) {
                    await copy(sourceDir, this.fullPath);
                    Logger.log('[KnowledgeCenter] 首次启动：成功将初始文档拷贝至数据目录', this.fullPath);
                } else {
                    Logger.warn('[KnowledgeCenter] 未在 resources 中找到初始文档', sourceDir);
                }
            } else {
                Logger.log('[KnowledgeCenter] 数据目录已存在，跳过拷贝', this.fullPath);
            }

            this.isInitialized = true;
        } catch (error) {
            Logger.error('[KnowledgeCenter] 初始化拷贝失败:', error);
        }
    }
}

// 直接实例化并导出
export const knowledgeCenter = new KnowledgeCenter();