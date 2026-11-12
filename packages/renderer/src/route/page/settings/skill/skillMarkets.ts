export type SkillMarket = {
    id: string;
    name: string;
    url: string;
    description: string;
    tags: string[];
};

export const SKILL_MARKETS: SkillMarket[] = [
    {
        id: 'skillsmp',
        name: 'SkillsMP',
        url: 'https://skillsmp.com/',
        description:
            '社区驱动的 Agent Skills 生态地图，聚合 300 万+ 来自 GitHub 的技能，支持按职业浏览与关键词搜索，适合长尾发现和跨领域探索。',
        tags: ['社区驱动', '300万+', '职业分类'],
    },
    {
        id: 'anthropic-skills',
        name: 'Anthropic 官方 Skills',
        url: 'https://github.com/anthropics/skills',
        description:
            'Anthropic 官方维护的参考实现，包含文档处理（pdf/docx/pptx/xlsx）、skill-creator 等生产级示例，是学习 SKILL.md 规范和质量标杆的最佳起点。',
        tags: ['官方', '质量标杆', '文档处理'],
    },
    {
        id: 'lobehub-skills',
        name: 'LobeHub Skills',
        url: 'https://lobehub.com/skills',
        description:
            'LobeHub 社区技能市场，覆盖 Claude、Codex、ChatGPT 等多客户端，技能以 SKILL.md 为入口，可直接浏览、安装和分享。',
        tags: ['多客户端', '社区', '写作/研究/编程'],
    },
    {
        id: 'agentskill-sh',
        name: 'agentskill.sh',
        url: 'https://agentskill.sh/',
        description:
            '提供 11 万+ 技能目录，支持 CLI / MCP 方式搜索安装，带 Agent 评分反馈和版本追踪，覆盖 20+ 主流 Agent 平台。',
        tags: ['CLI/MCP', '版本追踪', '20+平台'],
    },
    {
        id: 'skillhub-cn',
        name: '腾讯 SkillHub',
        url: 'https://skillhub.cn/',
        description:
            '专为中国用户优化的 AI Skills 社区，国内高速镜像实现秒速安装，支持中文搜索、安全审核，兼容 OpenClaw、Claude Code、Cursor 等生态。',
        tags: ['中国优化', '高速镜像', '中文搜索'],
    },
    {
        id: 'deepskill-market',
        name: 'DeepSkill Market',
        url: 'https://www.deepskill.market/',
        description:
            '美团 AI 团队推出的技能平台，收录 35 万+ 技能，强调真实任务跑通验证和用户评价，可通过自然语言描述需求寻找合适 Skill，类似“AI 版大众点评”。',
        tags: ['真实任务验证', '用户评价', '35万+'],
    },
    {
        id: 'awesome-claude-skills',
        name: 'awesome-claude-skills',
        url: 'https://github.com/ComposioHQ/awesome-claude-skills',
        description:
            'Composio 团队维护的精选列表，包含 1000+ 生产就绪的 Skills 和插件，分类清晰，适合按具体用例和工具集成场景查找。',
        tags: ['精选', '1000+', '工具集成'],
    },
    {
        id: 'claudeskills-info',
        name: 'ClaudeSkills.info',
        url: 'https://claudeskills.info/',
        description:
            'UI 友好的在线技能目录，适合“逛”着发现技能，提供分类浏览和搜索，对新手比较友好。',
        tags: ['浏览友好', '分类', '新手友好'],
    },
];