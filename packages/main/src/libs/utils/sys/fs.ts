import { access, opendir } from 'node:fs/promises';
import { join } from 'node:path';
/**
 * 判断 unknown 是否为带 code 的 Node 系统错误
 */
function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
    return err instanceof Error && 'code' in err;
}

/**
 * 判断目录是否为空（路径不存在时视为为空）
 * @param dirPath 目标目录路径
 */
export async function isDirEmpty(dirPath: string): Promise<boolean> {
    let dir;
    try {
        dir = await opendir(dirPath);
        const firstEntry = await dir.read();
        return firstEntry === null;
    } catch (error: unknown) {
        if (isErrnoException(error) && error.code === 'ENOENT') {
            return true;
        }
        throw error;
    } finally {
        if (dir) {
            await dir.close();
        }
    }
}

/**
 * 在 dir 下生成形如 `${prefix}${n}` 的名称（n 从 1 递增），只检查不创建。
 * - 优先复用被删除后留下的空位（如已有 1,2,4，则返回 3）
 * - 目录不存在直接抛错，不创建
 * - 返回前用 access 确认候选名未被占用
 * @param dir 目标目录
 * @param prefix 名称前缀，默认 'untitle'
 * @returns 有效的名称（不含目录）
 */
export async function nextIncrementalName(
    dir: string,
    prefix = 'untitled'
): Promise<string> {

    // 1. 流式读取目录，收集所有已存在的序号
    const used = new Set<number>();
    const prefixLower = prefix.toLowerCase();

    const dirHandle = await opendir(dir);
    try {
        for await (const entry of dirHandle) {
            const name = entry.name;
            if (name.length <= prefix.length) continue;
            if (!name.toLowerCase().startsWith(prefixLower)) continue;
            const suffix = name.slice(prefix.length);
            if (/^\d+$/.test(suffix)) {
                used.add(parseInt(suffix, 10));
            }
        }
    } finally {
        await dirHandle.close().catch(() => { });
    }

    // 2. 从 1 开始找第一个未使用的序号
    let candidate = 1;
    while (used.has(candidate)) {
        candidate++;
    }

    // 3. 用 access 兜底确认（防止读取与返回之间的窗口/隐藏项）
    for (let n = candidate; n < candidate + 1000; n++) {
        const candidateName = `${prefix}${n}`;
        const candidatePath = join(dir, candidateName);
        try {
            await access(candidatePath);
            // 已存在，继续下一个
        } catch (err: unknown) {
            if (isErrnoException(err) && err.code === 'ENOENT') {
                return candidateName;
            }
            throw err;
        }
    }
    throw new Error('无法生成有效名称：尝试次数过多');
}