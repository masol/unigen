import { opendir } from 'node:fs/promises';

/**
 * 判断目录是否为空（路径不存在时视为为空）
 * @param dirPath 目标目录路径
 */
export async function isDirEmpty(dirPath: string): Promise<boolean> {
    let dir;
    try {
        // 打开目录句柄
        dir = await opendir(dirPath);

        // 只读取第一项
        const firstEntry = await dir.read();

        // 如果第一项是 null，说明没有任何文件/子目录，即为空
        return firstEntry === null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        // 关键修正：捕获 ENOENT（路径不存在），按照您的需求直接视为“空”
        if (error.code === 'ENOENT') {
            return true;
        }
        // 其他错误（如权限不足等）则继续向上抛出
        throw error;
    } finally {
        // 显式关闭目录句柄，防止内存或文件描述符泄漏
        if (dir) {
            await dir.close();
        }
    }
}
