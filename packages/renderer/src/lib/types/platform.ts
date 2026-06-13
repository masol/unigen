import type { RendererLogger } from 'electron-log'
import type { Evtbus } from '$lib/utils/evtbus'

export interface IPlatformContext {
    readonly log: RendererLogger;
    readonly evtbus: Evtbus;
}