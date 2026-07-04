import { allProtocols, type KnownProvider, type ProviderPreset } from "../../../../lib/utils/model/types";


export const KNOWN_PROVIDERS: KnownProvider = [
    {
        heading: "中国服务商",
        presets: [
            {
                id: "deepseek",
                label: "DeepSeek (深度求索)",
                protocol: allProtocols.openai,
                baseUrl: "https://api.deepseek.com",
                website: "https://platform.deepseek.com/api_keys",
                note: "探索人工通用智能（AGI）",
                maxconn: 3
            },
            {
                id: "qwen",
                label: "通义千问 (阿里云百炼)",
                protocol: allProtocols.openai,
                baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
                website: "https://bailian.console.aliyun.com/?apiKey=1#/api-key",
                note: "全栈企业级大模型服务平台",
                maxconn: 3
            },
            {
                id: "siliconflow",
                label: "SiliconFlow (硅基流动)",
                protocol: allProtocols.openai,
                baseUrl: "https://api.siliconflow.cn/v1",
                website: "https://cloud.siliconflow.cn/account/ak",
                note: "提供更便宜、更快速的大模型平台",
                maxconn: 3
            },
            {
                id: "zhipu",
                label: "智谱 AI",
                protocol: allProtocols.openai,
                baseUrl: "https://open.bigmodel.cn/api/paas/v4",
                website: "https://open.bigmodel.cn/usercenter/apikeys",
                note: "让机器像人一样思考",
                maxconn: 3
            },
            {
                id: "moonshot",
                label: "月之暗面 (Kimi)",
                protocol: allProtocols.openai,
                baseUrl: "https://api.moonshot.cn/v1",
                website: "https://platform.moonshot.cn/console/api-keys",
                note: "寻求陪伴、探索世界的 AI 助手",
                maxconn: 3
            },
            {
                id: "doubao",
                label: "豆包大模型 (火山引擎)",
                protocol: allProtocols.openai,
                baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
                website: "https://volcengine.com",
                note: "你的全能 AI 伙伴",
                maxconn: 3
            },
            {
                id: "wenxin",
                label: "文心一言 (百度智能云)",
                protocol: allProtocols.openai,
                baseUrl: "https://qianfan.baidubce.com/v2",
                website: "https://baidu.com",
                note: "知识增强的大语言模型",
                maxconn: 3
            },
            {
                id: "hunyuan",
                label: "腾讯混元 (腾讯云)",
                protocol: allProtocols.openai,
                baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
                website: "https://tencent.com",
                note: "懂思维、擅创作、会编程的 AI 助手",
                maxconn: 3
            },
            {
                id: "baichuan",
                label: "百川智能",
                protocol: allProtocols.openai,
                baseUrl: "https://api.baichuan-ai.com/v1",
                website: "https://baichuan-ai.com",
                note: "致力于用中国智慧赋能世界",
                maxconn: 3
            },
            {
                id: "minimax",
                label: "MiniMax (海螺 AI)",
                protocol: allProtocols.anthropic,
                baseUrl: "https://api.minimaxi.com/anthropic",
                website: "https://minimaxi.com",
                note: "与用户共同陪伴、共同创造世界",
                maxconn: 3
            },
            {
                id: "spark",
                label: "讯飞星火 (科大讯飞)",
                protocol: allProtocols.openai,
                baseUrl: "https://spark-api-open.xf-yun.com/v1/",
                website: "https://xfyun.cn",
                note: "解放生产力，释放想象力",
                maxconn: 3
            },
            {
                id: "sensenova",
                label: "日日新 (商汤科技)",
                protocol: allProtocols.openai,
                baseUrl: "https://sensenova.cn",
                website: "https://www.sensetime.com",
                note: "大模型，新范式",
                maxconn: 3
            },
            {
                id: "stepfun",
                label: "阶跃星辰 (跃问)",
                protocol: allProtocols.openai,
                baseUrl: "https://api.stepfun.com/v1",
                website: "https://stepfun.com",
                note: "迈向通用人工智能的新阶跃",
                maxconn: 3
            }
        ]
    },
    {
        heading: "美国服务商",
        presets: [
            {
                id: "openai",
                label: "OpenAI",
                protocol: allProtocols.openai,
                baseUrl: "https://api.openai.com/v1",
                website: "https://platform.openai.com/api-keys",
                note: "构建安全、受益于全人类的通用人工智能（AGI）",
                maxconn: 3
            },
            {
                id: "anthropic",
                label: "Anthropic",
                protocol: allProtocols.anthropic,
                baseUrl: "https://api.anthropic.com",
                website: "https://console.anthropic.com/settings/keys",
                note: "构建以人类利益为核心、可靠、可解释的可控 AI 系统",
                maxconn: 3
            },
            {
                id: "google-gemini",
                label: "Google Gemini",
                protocol: allProtocols.vertex,
                baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
                website: "https://aistudio.google.com/apikey",
                note: "汇聚谷歌前沿技术、最具通用性的原生多模态大模型",
                maxconn: 3
            },
            {
                id: "mistral",
                label: "Mistral AI",
                protocol: allProtocols.openai,
                baseUrl: "https://api.mistral.ai/v1",
                website: "https://console.mistral.ai/api-keys/",
                note: "将前沿人工智能技术带向全行业，让大模型触手可及",
                maxconn: 3
            },
            {
                id: "groq",
                label: "Groq",
                protocol: allProtocols.openai,
                baseUrl: "https://api.groq.com/openai/v1",
                website: "https://console.groq.com/keys",
                note: "基于 LPU 技术，专为超低延迟、极速推理而生的算力平台",
                maxconn: 3
            },
            {
                id: "together",
                label: "Together AI",
                protocol: allProtocols.openai,
                baseUrl: "https://api.together.xyz/v1",
                website: "https://api.together.ai/settings/api-keys",
                note: "为全球开发者打造，性能更优、更高效的开源大模型云平台",
                maxconn: 3
            },
            {
                id: "openrouter",
                label: "OpenRouter",
                protocol: allProtocols.openai,
                baseUrl: "https://openrouter.ai/api/v1",
                website: "https://openrouter.ai/keys",
                note: "支持跨模型横向对比、自由切换的智能多模型聚合路由服务",
                maxconn: 3
            },
            {
                id: "xai",
                label: "xAI",
                protocol: allProtocols.xai,
                baseUrl: "https://api.x.ai/v1",
                website: "https://console.x.ai/",
                note: "打造能回答复杂宇宙问题的智能科技，深入探索世界本质",
                maxconn: 3
            },
            {
                id: "huggingface",
                label: "Hugging Face (Inference Providers)",
                protocol: allProtocols.openai,
                baseUrl: "https://huggingface.co",
                website: "https://huggingface.co/",
                note: "汇聚全球开发者打造的 AI 开源社区",
                maxconn: 3
            }
        ]
    }, {
        heading: "本地部署",
        presets: [
            {
                id: "ollama",
                label: "Ollama (本地)",
                protocol: allProtocols.openai,
                baseUrl: "http://localhost:11434/v1",
                website: "",
                note: "本地部署，无需密钥",
                maxconn: 1
            },
            {
                id: "lmstudio",
                label: "LM Studio (本地)",
                protocol: allProtocols.openai,
                baseUrl: "http://localhost:1234/v1",
                website: "",
                note: "本地部署，无需密钥",
                maxconn: 1
            }]
    }
];


export function findPreset(pid: string): ProviderPreset | null {
    let preset: ProviderPreset | null = null;
    KNOWN_PROVIDERS.find((item) => {

        const p = item.presets.find(preset => preset.id === pid);
        if (p) {
            preset = p;
        }
        return p
    })
    return preset;

}