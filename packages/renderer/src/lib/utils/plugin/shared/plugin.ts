import type { PluginStatus, PluginInfo, PluginScope } from '@app/main/types'


export const BUILDIN_PLUGINS: PluginInfo[] = [
    {
        id: 'video',
        name: '视频创建',
        version: '0.0.1',
        description: '输入小说/剧本，生成视频。',
        status: 'enabled' as PluginStatus,
        scope: 'project' as PluginScope,
        installed: true,
        config: {},
        iconName: "video"
    }
]