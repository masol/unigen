import { PROVIDER_CONFIG } from "$lib/utils/llms/providers";
import { logger } from "$lib/utils/logger";
import { openUrl } from "@tauri-apps/plugin-opener";


export async function nav2Provider(provider: string) {
    const providerInfo = PROVIDER_CONFIG[provider];
    if (providerInfo && providerInfo.apikeyURL) {
        await openUrl(providerInfo.apikeyURL);
    } else {
        logger.error("请求跳到到Apikey管理页，但是未被支持的provider:", provider)
    }
}