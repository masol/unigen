import PromptDialog from "$lib/components/dialog/Prompt.svelte";
import { dialogStore } from "$lib/store/ui/dialog.svelte";
import { fileStore } from "./file.store.svelte";
import type { FileNode } from "./file.types";

const ILLEGAL_CHARS = '\\/:*?"<>|';
const MAX_NAME_LENGTH = 100;

/** 是否包含控制字符（0x00–0x1F）或文件系统非法字符。 */
function hasIllegalChar(value: string): boolean {
    for (const ch of value) {
        const code = ch.codePointAt(0) ?? 0;
        if (code < 0x20) return true;
        if (ILLEGAL_CHARS.includes(ch)) return true;
    }
    return false;
}

/** 返回错误消息，空串表示通过。 */
function validateName(
    value: string,
    parentPath: string,
    excludeId: string | null,
): string {
    if (value === "." || value === "..") return "名称不能为 . 或 ..";
    if (hasIllegalChar(value)) {
        return '名称不能包含 \\ / : * ? " < > | 等字符';
    }
    if (value.length > MAX_NAME_LENGTH) {
        return `名称不能超过 ${MAX_NAME_LENGTH} 个字符`;
    }
    if (fileStore.hasSiblingWithName(parentPath, value, excludeId)) {
        return "同目录下已存在同名项";
    }
    return "";
}

/** 弹出命名对话框，返回去除首尾空白后的名称；取消或空值返回 null。 */
export async function promptCreateName(
    type: "file" | "folder",
    parentPath: string,
): Promise<string | null> {
    const isFile = type === "file";
    const result = await dialogStore.safeShow(PromptDialog, {
        title: isFile ? "新建文件" : "新建文件夹",
        label: isFile ? "文件名称" : "文件夹名称",
        placeholder: isFile ? "请输入文件名" : "请输入文件夹名",
        initialValue: isFile ? "新建文件.md" : "新建文件夹",
        confirmText: "创建",
        required: true,
        validator: (value: string) =>
            validateName(value, parentPath, null) || false,
    });

    if (typeof result !== "string") return null;
    const trimmed = result.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/** 弹出重命名对话框；返回 null 表示取消或未修改。 */
export async function promptRename(
    node: FileNode,
    parentPath: string,
): Promise<string | null> {
    const isFile = node.type === "file";
    const result = await dialogStore.safeShow(PromptDialog, {
        title: isFile ? "重命名文件" : "重命名文件夹",
        label: isFile ? "文件名称" : "文件夹名称",
        initialValue: node.name,
        confirmText: "重命名",
        required: true,
        validator: (value: string) => {
            if (value === node.name) return "名称未更改";
            return validateName(value, parentPath, node.id) || false;
        },
    });

    if (typeof result !== "string") return null;
    const trimmed = result.trim();
    return trimmed.length > 0 ? trimmed : null;
}