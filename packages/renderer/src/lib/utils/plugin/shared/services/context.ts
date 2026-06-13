// src/lib/utils/shared/service.demo.ts
//
// 演示用平台服务实现
// ─────────────────────────────────────────────────────────────

import { PlatformService } from '$lib/types/plugin/platform'
import type { RendererLogger } from 'electron-log'
import log from 'electron-log/renderer'
import evtbus, { type Evtbus } from '$lib/utils/evtbus'
import type { IPlatformContext } from '$lib/types/plugin/platform'

/**
 * 插件通过 container.resolve('logger') 获取此实例
 */
export class PlatformContext extends PlatformService implements IPlatformContext {
    constructor() {
        super({
            serviceId: 'context',
            version: '1.0.0',
            capabilities: ['log'],
        })
    }

    get log(): RendererLogger {
        return log;
    }

    get evtbus(): Evtbus {
        return evtbus
    }
}