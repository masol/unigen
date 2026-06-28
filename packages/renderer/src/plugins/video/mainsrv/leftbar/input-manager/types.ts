/**
 * 输入管理面板 — 类型定义
 * 约束：所有跨组件通信的数据形状必须在此处声明。
 */

export type ScriptBar = {
    id: string;
    text: string;
};

export type ScriptItem = {
    id: string;
    size: number;
    updatedAt: number;
};

export type ReferenceKind =
    | 'character'      // 角色参考
    | 'environment'    // 环境参考
    | 'prop'           // 物品参考
    | 'style'          // 风格参考
    | 'voice'          // 声音参考
    | 'bgm'            // 背景音乐参考
    | 'other';         // 其他

export type ReferenceItem = {
    id: string;
    kind: 'voice' | 'image' | 'video',
    fileName: string;
};

export type ReferenceDraft = {
    kind: ReferenceKind;
    caption: string;
    imageUrl: string;
    fileName: string;
    fileSize: number;
};