import type { IPlatformService } from "$lib/types/plugin";
import { LoggerService } from "./services/logger";

export const PLATFORM_SERVICES: Record<string, IPlatformService> = {
    logger: new LoggerService(),
}