import type { PluginStatus, PluginInfo, PluginScope } from '@app/main/types'


export const BUILDIN_PLUGINS: PluginInfo[] = [
    {
        id: 'plugin-core',
        name: 'Core Services',
        version: '0.0.1',
        description: '核心功能插件，不可禁用',
        status: 'enabled' as PluginStatus,
        scope: 'core' as PluginScope,
        installed: true,
        config: {},
        installedAt: Date.now(),
        statusChangedAt: Date.now(),
    }
]