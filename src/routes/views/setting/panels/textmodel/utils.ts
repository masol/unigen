import { logger } from "$lib/utils/logger";
import { openUrl } from "@tauri-apps/plugin-opener";


const ApikeyURL: Record<string, string> = {
    "qianwen": "https://dashscope.console.aliyun.com/apiKey",
    "deepseek": "https://platform.deepseek.com/api_keys",
    "zhipu": "https://bigmodel.cn/usercenter/proj-mgmt/apikeys",
    "openai": "https://platform.openai.com/api-keys",
    "openrouter": "https://openrouter.ai/settings/keys",
    "groq": "https://console.groq.com/keys",
    "moonshot": "https://platform.moonshot.cn/console/api-keys",
    "poe": "https://poe.com/api_key"
}

export async function nav2Provider(provider: string) {
    const url: string = ApikeyURL[provider];
    if (url) {
        await openUrl(url);
    } else {
        logger.error("请求跳到到Apikey管理页，但是未被支持的provider:", provider)
    }
}