// 这里导出的类型，目的是与renderer共享类型的--只能是type导出--默认的shared子目录为与renderer共享的类型定义。
export type { ScriptItem } from '../plugins/video/metag/script.js'
export type { AppConfig, RecentProject } from './appconfig.js'
export type { RunState } from './blueprint/state.js'
export type { AppClient, NotifyContract } from './shared/api.js'
export type { BlueprintKind } from './shared/api/list.js'
export type { FileFilterPreset } from './shared/api/sys.js'
export type { Model, ModelOption, ModelTags, Provider, ProviderProtocol } from './shared/model.js'
export type { ModuleSource, PluginInfo, PluginScope, PluginStatus } from './shared/plugin.js'
export type { WindowEventPayload, WindowEventType } from './shared/rpcevt.js'

