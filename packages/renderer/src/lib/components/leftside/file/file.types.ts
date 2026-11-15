/**
 * 客户端侧文件树类型——统一复用主进程共享类型，避免双源漂移。
 *
 * - FileNode     = PacNode（PAC 文件树节点，不含 content）
 * - FileDocument = PacFileDocument（front-matter + 正文）
 *
 * 通过 `export type ... from` 保持现有 `import type { FileNode } from './file.types'`
 * 引用路径不变，同时把真源收敛到 @app/main/types。
 */
export type {
    PacFileDocument as FileDocument,
    PacNode as FileNode
} from "@app/main/types";
