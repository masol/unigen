// packages/renderer/src/route/page/settings/kb/kbTypes.ts
export type { KbCollection, KbDoc, KbDocStatus } from "@app/main/types";

import type { KbCollectionInput } from "@app/main/types";

export type { KbCollectionInput };

/**
 * 编辑对话框返回值。
 *
 * - save   ：提交名称/简介/文档
 * - delete ：用户主动清空全部文档并确认删除此知识集
 * - cancel ：显式取消（遮罩/Esc 关闭由 dialogStore 返回 null）
 */
export type KbEditorResult =
    | ({ action: "save" } & KbCollectionInput)
    | { action: "delete" }
    | { action: "cancel" };