// Reexport your entry components here
import { localeStore } from "./stores/config/ipc/i18n.svelte.js"
import { lightStore } from "./stores/config/ipc/light.svelte.js";
import { softinfo } from "./utils/softinfo.js";
import { appDB } from "./utils/appdb/index.js";
import { repositoryStore } from "./stores/config/ipc/repository.svelte.js";
import { projectStore } from "./stores/project/project.svelte.js";
import { mqttInstance } from "./utils/appdb/mqtt.js";

export async function init() {
    // 开始初始化mqtt,无需等待，不再依赖softinfo.
    mqttInstance.init();

    // 先获取info,并确保内部初始化完毕(数据库有效．)
    await softinfo.init();
    // 开始初始化数据库．
    await appDB.init()

    await Promise.all([
        localeStore.init(),
        lightStore.init(),
        (async () => {
            await repositoryStore.init();
            await projectStore.init();
        })(),
    ]);
}