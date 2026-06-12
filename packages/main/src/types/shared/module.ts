
export interface ModuleSource {
    code: string
    version?: string // 如果请求的pluginId中未包含version,这里返回code对应的version.
}



/** 插件来源 / 层级 */
export type PluginScope = 'core' | 'system' | 'project'

/** 插件安装状态 */
export type PluginStatus = 'enabled' | 'disabled' | 'error'

/**
 * 插件原始数据（来自服务端 / 静态清单 / 项目配置）
 * 纯数据，无运行时状态
 */
export interface PluginInfo {
    id: string
    name: string
    version: string
    description: string
    /** 插件来源层级 */
    scope: PluginScope
    /** 是否已安装（false 表示可用但未安装，为未来云端插件列表预留） */
    installed: boolean
    /** 安装时间戳；未安装时为 null */
    installedAt: number | null
    /** 插件级配置，结构由各插件自定义 */
    config: Record<string, unknown>
    /** 最近一次状态变更时间戳；未安装时为 null */
    statusChangedAt: number | null
    /** 安装后的启用状态；未安装时忽略 */
    status: PluginStatus
}
