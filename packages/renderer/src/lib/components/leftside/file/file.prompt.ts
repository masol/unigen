import PromptDialog from "$lib/components/dialog/Prompt.svelte";
import { dialogStore } from "$lib/store/ui/dialog.svelte";
import { fileStore } from "./file.store.svelte";

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
export function validatePacName(
    value: string,
    parentPath: string,
    excludeId: string | null,
): string {
    const name = value.trim();

    if (!name) return "名称不能为空";
    if (name === "." || name === "..") return "名称不能为 . 或 ..";
    if (hasIllegalChar(name)) {
        return '名称不能包含 \\ / : * ? " < > | 等字符';
    }
    if (name.length > MAX_NAME_LENGTH) {
        return `名称不能超过 ${MAX_NAME_LENGTH} 个字符`;
    }
    if (fileStore.hasSiblingWithName(parentPath, name, excludeId)) {
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
            validatePacName(value, parentPath, null) || false,
    });

    if (typeof result !== "string") return null;
    const trimmed = result.trim();
    return trimmed.length > 0 ? trimmed : null;
}