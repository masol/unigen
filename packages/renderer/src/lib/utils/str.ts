

// 将地址转化为协议路径。
export function slash(path: string) {
    const isExtendedLengthPath = path.startsWith('\\\\?\\');

    if (isExtendedLengthPath) {
        return path;
    }

    return path.replace(/\\/g, '/');
}

export function path2URL(path: string) {
    return `appfile://${slash(path)}`
}