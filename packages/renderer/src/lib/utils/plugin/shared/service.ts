import type { IPlatformService } from "$lib/types/plugin/platform";
import { PlatformContext } from "./services/context";

export const PLATFORM_SERVICES: Record<string, IPlatformService> = {
    ctx: new PlatformContext(),
}