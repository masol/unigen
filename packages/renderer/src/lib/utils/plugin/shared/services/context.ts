// src/lib/utils/shared/service.demo.ts
//
// 演示用平台服务实现
// ─────────────────────────────────────────────────────────────

import { PlatformService } from '$lib/types/plugin/platform'
import type { RendererLogger } from 'electron-log'
import log from 'electron-log/renderer'
import evtbus, { type Evtbus } from '$lib/utils/evtbus'
import type { IPlatformContext } from '$lib/types/plugin/platform'
import { leftSidebarExtPoint, type LeftSidebarItem } from '../../extpoint/leftsidebar'
import type { IPluginExtensionPoint } from '$lib/types/plugin/extpoint/slot'

/**
 * 插件通过 container.resolve('logger') 获取此实例
 */
export class PlatformContext extends PlatformService implements IPlatformContext {
    constructor() {
        super({
            serviceId: 'context',
            version: '0.0.1',
            capabilities: ['log'],
        })
    }

    get log(): RendererLogger {
        return log;
    }

    get evtbus(): Evtbus {
        return evtbus
    }

    get extActivity(): IPluginExtensionPoint<LeftSidebarItem> {
        return leftSidebarExtPoint
    }
}