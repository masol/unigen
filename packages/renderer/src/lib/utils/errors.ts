/**
 * 共享错误类型：让 service 层只负责"抛"，UI/store 层只负责"显示"。
 * 未来后端提供 FeatureNotSupported 之类异常时，可直接换成 orpc 返回值。
 */
export class FeatureNotSupportedError extends Error {
    constructor(message = '该功能尚未支持') {
        super(message);
        this.name = 'FeatureNotSupportedError';
    }
}