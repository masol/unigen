import evtbus from "$lib/utils/evtbus";
import Logger from "electron-log/renderer.js";
import { toast } from "svelte-sonner";

export function setupToaster() {

    // @todo: 移动到专门的clarify处理模块来处理，而不是这里处理。
    evtbus.on("toast", async ({ type, msg }) => {
        switch (type) {
            case 'error':
                toast.error(msg);
                break;
            case 'success':
                toast.success(msg);
                break;
            case 'info':
                toast.info(msg);
                break;
            case 'warning':
                toast.warning(msg);
                break;
            case 'message':
                toast.message(msg);
                break;
            case 'loading':
                toast.loading(msg);
                break;
            default:
                Logger.warn("未支持的toast类型:", type, msg);
        }
    })
}