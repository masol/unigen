// src/lib/utils/shared/service.demo.ts
//
// 演示用平台服务实现
// ─────────────────────────────────────────────────────────────

import { PlatformService } from '$lib/types/plugin'
import log from 'electron-log/renderer'

/**
 * 插件通过 container.resolve('logger') 获取此实例
 */
export class LoggerService extends PlatformService {
    constructor() {
        super({
            serviceId: 'logger',
            version: '1.0.0',
            capabilities: ['log', 'warn', 'error', 'debug'],
        })
    }

    debug(msg: string, ...args: unknown[]): void {
        log.debug(`[Plugin] ${msg}`, ...args)
    }

    info(msg: string, ...args: unknown[]): void {
        log.info(`[Plugin] ${msg}`, ...args)
    }

    warn(msg: string, ...args: unknown[]): void {
        log.warn(`[Plugin] ${msg}`, ...args)
    }

    error(msg: string, ...args: unknown[]): void {
        log.error(`[Plugin] ${msg}`, ...args)
    }
}