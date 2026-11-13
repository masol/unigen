export type KbDocStatus = 'ready' | 'converting' | 'failed';

export type KbDoc = {
    id: string;
    name: string;
    size: number;
    kind: string;
    status: KbDocStatus;
};

export type KbCollection = {
    id: string;
    name: string;
    description: string;
    docs: KbDoc[];
    /** ISO 时间戳，用于卡片底部展示"更新于 X 前"。 */
    updatedAt: string;
};

export type KbCollectionInput = {
    name: string;
    description: string;
    docs: KbDoc[];
};

/**
 * 编辑对话框返回值。
 *
 * - save   ：提交名称/简介/文档
 * - delete ：用户主动清空全部文档并确认删除此知识集
 * - cancel ：显式取消（遮罩/Esc 关闭由 dialogStore 返回 null）
 */
export type KbEditorResult =
    | ({ action: 'save' } & KbCollectionInput)
    | { action: 'delete' }
    | { action: 'cancel' };