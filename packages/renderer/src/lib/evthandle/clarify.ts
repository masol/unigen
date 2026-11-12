import TextInputDialog from "$lib/components/dyn/dialog/TextInputDialog.svelte";
import { dialogStore } from "$lib/store/ui/dialog.svelte";
import { safeApi } from "$lib/utils/api";
import evtbus from "$lib/utils/evtbus";


export function setupClarify() {

    // @todo: 移动到专门的clarify处理模块来处理，而不是这里处理。
    evtbus.on("clarify", async ({ question, uuid, options }) => {
        const extHints = options && options.length > 0 ? "可以从右上方的“插入片段”确定模板，然后修改确定。" : "可以回应“你自行补充一切细节吧。”";
        const content = await dialogStore.safeShow(
            TextInputDialog,
            {
                title: "请澄清细节",
                description: question,
                options,
                placeholder: `回答上面的问题，${extHints}`,
            },
            { size: "xl" },
        );
        await safeApi().project.clarify({
            uuid,
            answer: content ?? ""
        })

    })
}