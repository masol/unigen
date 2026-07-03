import type { Evtbus } from '$lib/utils/evtbus';
import type { UnigenHookType } from '$lib/utils/hook';
import type { LeftSidebarItem } from '$lib/utils/plugin/extpoint/leftsidebar';
import type { RendererLogger } from 'electron-log';
import type { IPluginExtensionPoint } from './extpoint/slot';

export interface IPlatformContext {
    readonly log: RendererLogger;
    readonly evtbus: Evtbus;
    readonly hook: UnigenHookType;
    readonly extActivity: IPluginExtensionPoint<LeftSidebarItem>;
}




// 平台服务基础接口与基类
// ─────────────────────────────────────────────────────────────

/**
 * 平台服务元数据
 * 容器/运行时通过此结构查阅服务能力，而无需依赖具体实现
 */
export interface PlatformServiceMeta {
    /** 服务唯一标识，建议与注入 key 一致 */
    readonly serviceId: string
    /** 服务版本（semver） */
    readonly version: string
    /** 服务提供的能力标签，供插件按需查询 */
    readonly capabilities: ReadonlyArray<string>
}

/**
 * 平台服务最小接口
 *
 * 所有平台服务 **必须** 实现此接口。
 * 基于接口而非基类检查，保持最大灵活性；
 * 同时提供 PlatformService 基类作为推荐起点。
 *
 * 为何要 meta 而非裸 object？
 *   - 裸 object 经 asValue() 注入后引用不变，IoC 容器无压力
 *   - 但运行时需要在不实例化、不 import 具体类的情况下查阅服务能力
 *   - meta 提供了这个"自描述"能力，且与 DI 容器完全解耦
 */
export interface IPlatformService {
    readonly meta: PlatformServiceMeta

    /**
     * 可选：服务销毁钩子
     * disposeAll() 时由运行时调用
     */
    dispose?(): Promise<void> | void
}

/** 类型守卫：判断任意值是否为平台服务 */
export function isPlatformService(value: unknown): value is IPlatformService {
    return (
        value !== null &&
        typeof value === 'object' &&
        'meta' in value &&
        typeof (value as IPlatformService).meta === 'object'
    )
}

/**
 * 平台服务推荐基类
 *
 * 派生类只需在构造函数中传入 meta，其余由基类处理。
 * 裸 object 也可实现 IPlatformService，但基类提供了
 * capabilities 查询等便利方法。
 *
 * @example
 * class LogService extends PlatformService {
 *   constructor() {
 *     super({ serviceId: 'logger', version: '1.0.0', capabilities: ['log', 'warn', 'error'] })
 *   }
 *   log(msg: string) { ... }
 * }
 */
export abstract class PlatformService implements IPlatformService {
    readonly meta: PlatformServiceMeta

    protected constructor(meta: PlatformServiceMeta) {
        this.meta = Object.freeze({ ...meta })
    }

    /** 便利方法：检查是否具备某能力 */
    hasCapability(cap: string): boolean {
        return this.meta.capabilities.includes(cap)
    }
}