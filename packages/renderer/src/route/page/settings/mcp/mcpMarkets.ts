export type McpMarket = {
    id: string;
    name: string;
    url: string;
    description: string;
    tags: string[];
};

export const MCP_MARKETS: McpMarket[] = [
    {
        id: 'mcpmarket-cn',
        name: 'MCPMarket',
        url: 'https://mcpmarket.cn/',
        description: '中文 MCP 商店，支持配置生成与在线测试。',
        tags: ['中文', '22000+', '在线测试'],
    },
    {
        id: 'lobehub-mcp',
        name: 'LobeHub MCP',
        url: 'https://lobehub.com/mcp',
        description: 'LobeChat 生态市场，支持桌面端一键安装。',
        tags: ['10000+', '一键安装', '多分类'],
    },
    {
        id: 'mcp-so',
        name: 'mcp.so',
        url: 'https://mcp.so/',
        description: '早期 MCP 资源托管平台，支持筛选与客户端适配。',
        tags: ['资源托管', '筛选', '社区活跃'],
    },
    {
        id: 'skillhub-mcp',
        name: '腾讯 SkillHub',
        url: 'https://skillhub.cn/',
        description: '含企业级 MCP Server，适合国内云原生与运维。',
        tags: ['腾讯云', '企业级', '国内'],
    },
    {
        id: 'aimcp',
        name: 'Aimcp.info',
        url: 'https://aimcp.info/',
        description: '中文 MCP 导航，支持中文关键词检索。',
        tags: ['中文', '导航', '检索'],
    },
    {
        id: 'smithery',
        name: 'Smithery',
        url: 'https://smithery.ai/',
        description: '主流 MCP 托管与分发平台，支持一行命令部署。',
        tags: ['托管', '部署', '国际'],
    },
    {
        id: 'mcp-marketplace',
        name: 'mcp-marketplace.io',
        url: 'https://mcp-marketplace.io/',
        description: '带安全扫描的国际市场，支持创作者变现。',
        tags: ['安全扫描', '4700+', '变现'],
    },
    {
        id: 'pulsemcp',
        name: 'PulseMCP',
        url: 'https://www.pulsemcp.com/',
        description: '社区资源聚合，提供推荐与每日更新。',
        tags: ['社区', '推荐', '每日更新'],
    },
    {
        id: 'mcp-registry',
        name: 'MCP Registry',
        url: 'https://registry.modelcontextprotocol.io/',
        description: '官方开源注册表，第三方市场的基础索引。',
        tags: ['官方', '开源', '索引'],
    },
];