import type { RouterClient } from '@orpc/server'
import type { AppRouter } from '../../api/index.js'
import { ProjectContainer } from '$libs/project/project.js';

// 自动推导出普通调用接口：client.test('world') => Promise<string>
export type AppClient = RouterClient<AppRouter>


export type NotifyContract = {
    name: string; // 事件id。
    srcId: number; // 导致本事件发生的id，如果是系统事件，则设置为-1.
    payload: unknown;
}

export interface AlsStore {
    project: ProjectContainer; // 从你定义的 RpcContext 中安全继承 project 类型
    traceId: string;
}


/**
 * 预置文件过滤器类型
 */
export enum FileFilterPreset {
    JSON = 'json',
    TEXT = 'text',
    IMAGE = 'image',
    VIDEO = 'video',
    AUDIO = 'audio',
    MARKDOWN = 'markdown',
    CSV = 'csv',
    PDF = 'pdf',
    DOC = 'doc',
    ALL = 'all',
}

/**
 * 文件读取后的返回模式
 * - content : 文本文件 → utf-8 字符串；二进制文件 → data-URI (base64)
 * - path    : 只返回文件绝对路径（大文件 / 视频 / 音频推荐）
 */
export enum FileReturnMode {
    /** 返回文件内容（文本 utf-8 / 二进制 base64 data-uri） */
    CONTENT = 'content',
    /** 仅返回文件路径，由渲染进程通过 custom protocol 访问 */
    PATH = 'path',
}
