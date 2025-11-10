import { invoke } from "@tauri-apps/api/core";
import JSON5 from 'json5';
import { isPlainObject, isArray, isString, isNumber, isBoolean, isError } from 'remeda';

// 自定义类型守卫
const isNull = (value: unknown): value is null => value === null;
const isUndefined = (value: unknown): value is undefined => value === undefined;

/**
 * 日志级别类型
 */
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

/**
 * 基础可序列化类型
 */
type PrimitiveSerializable = string | number | boolean | null | undefined;

/**
 * 对象类型（排除 null）
 */
type ObjectType = object | Record<string, unknown> | unknown[];

/**
 * 可序列化的值类型
 */
type Serializable = PrimitiveSerializable | Error | ObjectType;

/**
 * Span 结束函数类型
 */
type SpanEndFunction = () => void;

/**
 * Console 方法类型
 */
type ConsoleMethod = (...args: unknown[]) => void;

/**
 * 日志配置选项
 */
interface LoggerConfig {
    /**
     * 是否启用降级到浏览器控制台
     * @default true
     */
    enableConsoleFallback?: boolean;

    /**
     * JSON 格式化缩进空格数
     * @default 2
     */
    jsonIndent?: number;

    /**
     * 是否在控制台同时输出日志（用于开发调试）
     * @default false
     */
    enableConsoleOutput?: boolean;
}

/**
 * Logger 类 - 提供统一的日志接口
 */
class Logger {
    private currentSpan: string | null = null;
    private readonly config: Required<LoggerConfig>;

    constructor(config: LoggerConfig = {}) {
        this.config = {
            enableConsoleFallback: config.enableConsoleFallback ?? true,
            jsonIndent: config.jsonIndent ?? 2,
            enableConsoleOutput: config.enableConsoleOutput ?? false,
        };
    }

    /**
     * 检查值是否为 null 或 undefined
     */
    private isNullish(value: unknown): value is null | undefined {
        return isNull(value) || isUndefined(value);
    }

    /**
     * 格式化单个参数为字符串
     */
    private formatArgument(arg: Serializable): string {
        if (this.isNullish(arg)) {
            return String(arg);
        }

        if (isString(arg)) {
            return arg;
        }

        if (isNumber(arg) || isBoolean(arg)) {
            return String(arg);
        }

        if (isError(arg)) {
            return this.formatError(arg);
        }

        if (isPlainObject(arg) || isArray(arg)) {
            return this.formatObject(arg);
        }

        return String(arg);
    }

    /**
     * 格式化 Error 对象
     */
    private formatError(error: Error): string {
        const parts = [`${error.name}: ${error.message}`];

        if (error.stack) {
            parts.push(error.stack);
        }

        // 处理 Error 的自定义属性
        const errorAsRecord = error as unknown as Record<string, unknown>;
        const customProps = Object.keys(error).filter(
            key => !['name', 'message', 'stack'].includes(key)
        );

        if (customProps.length > 0) {
            const propsObj = customProps.reduce((acc, key) => {
                acc[key] = errorAsRecord[key];
                return acc;
            }, {} as Record<string, unknown>);

            parts.push('Additional properties:', this.formatObject(propsObj));
        }

        return parts.join('\n');
    }

    /**
     * 格式化对象为字符串
     */
    private formatObject(obj: ObjectType): string {
        try {
            return JSON5.stringify(obj, null, this.config.jsonIndent);
        } catch {
            // 如果序列化失败，尝试简单的 toString
            return String(obj);
        }
    }

    /**
     * 格式化参数为字符串
     */
    private formatMessage(...args: Serializable[]): string {
        return args.map(arg => this.formatArgument(arg)).join(' ');
    }

    /**
     * 降级到浏览器控制台输出
     */
    private fallbackToConsole(level: LogLevel, ...args: Serializable[]): void {
        if (!this.config.enableConsoleFallback) {
            return;
        }

        const consoleMethod = console[level] as ConsoleMethod | undefined;
        if (consoleMethod && typeof consoleMethod === 'function') {
            consoleMethod(...args);
        } else {
            console.log(...args);
        }
    }

    /**
     * 同时输出到控制台（用于开发调试）
     */
    private outputToConsole(level: LogLevel, message: string): void {
        if (!this.config.enableConsoleOutput) {
            return;
        }

        const consoleMethod = console[level] as ConsoleMethod | undefined;
        if (consoleMethod && typeof consoleMethod === 'function') {
            const prefix = this.currentSpan ? `[${this.currentSpan}]` : '';
            consoleMethod(`${prefix} ${message}`);
        }
    }

    /**
     * 发送日志到 Rust 后端
     */
    private async sendLog(level: LogLevel, ...args: Serializable[]): Promise<void> {
        const message = this.formatMessage(...args);

        // 开发环境同时输出到控制台
        this.outputToConsole(level, message);

        try {
            if (this.currentSpan) {
                await invoke('log_message_with_span', {
                    level,
                    message,
                    spanName: this.currentSpan
                });
            } else {
                await invoke('log_message', { level, message });
            }
        } catch (err) {
            console.error('Failed to send log to backend:', err);
            this.fallbackToConsole(level, ...args);
        }
    }

    /**
     * 记录 trace 级别日志
     */
    trace(...args: Serializable[]): void {
        if (!import.meta.env.PROD) {
            void this.sendLog('trace', ...args);
        }
    }

    /**
     * 记录 debug 级别日志
     */
    debug(...args: Serializable[]): void {
        if (!import.meta.env.PROD) {
            void this.sendLog('debug', ...args);
        }
    }

    /**
     * 记录 info 级别日志
     */
    info(...args: Serializable[]): void {
        if (!import.meta.env.PROD) {
            void this.sendLog('info', ...args);
        }
    }

    /**
     * 记录 warn 级别日志
     */
    warn(...args: Serializable[]): void {
        void this.sendLog('warn', ...args);
    }

    /**
     * 记录 error 级别日志
     */
    error(...args: Serializable[]): void {
        void this.sendLog('error', ...args);
    }

    /**
     * 开始一个 span（跟踪上下文）
     */
    span(spanName: string): SpanEndFunction {
        if (!isString(spanName) || spanName.trim() === '') {
            throw new Error('Span name must be a non-empty string');
        }

        const previousSpan = this.currentSpan;
        const fullSpanName = previousSpan
            ? `${previousSpan} > ${spanName}`
            : spanName;

        this.currentSpan = fullSpanName;

        this.debug(`[SPAN START] ${spanName}`);

        // 返回结束函数
        return (): void => {
            this.debug(`[SPAN END] ${spanName}`);
            this.currentSpan = previousSpan;
        };
    }

    /**
     * 使用 span 包装异步函数
     */
    async withSpan<T>(spanName: string, fn: () => Promise<T>): Promise<T> {
        const endSpan = this.span(spanName);
        try {
            const result = await fn();
            return result;
        } catch (err) {
            this.error(`Error in span ${spanName}:`, err as Error);
            throw err;
        } finally {
            endSpan();
        }
    }

    /**
     * 使用 span 包装同步函数
     */
    withSpanSync<T>(spanName: string, fn: () => T): T {
        const endSpan = this.span(spanName);
        try {
            const result = fn();
            return result;
        } catch (err) {
            this.error(`Error in span ${spanName}:`, err as Error);
            throw err;
        } finally {
            endSpan();
        }
    }

    /**
     * 重置当前 span（用于测试或特殊场景）
     */
    resetSpan(): void {
        this.currentSpan = null;
    }

    /**
     * 获取当前 span 名称
     */
    getCurrentSpan(): string | null {
        return this.currentSpan;
    }

    /**
     * 创建子 Logger 实例，继承当前配置
     */
    createChild(config?: Partial<LoggerConfig>): Logger {
        return new Logger({
            ...this.config,
            ...config,
        });
    }
}

// 导出默认单例实例
export const logger = new Logger();

// 导出类和类型供其他模块使用
export { Logger };
export type { LogLevel, Serializable, SpanEndFunction, LoggerConfig };