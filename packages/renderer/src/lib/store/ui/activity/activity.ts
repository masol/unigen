import DynEntry from '$lib/components/dyn/Entry.svelte';
import SessionHeader from '$lib/components/leftside/session/session.header.svelte';
import SessionManager from '$lib/components/leftside/session/session.list.svelte';
import type { BlueprintFilters, ProjectActivityData } from '@app/main/types';
import { layoutStore } from '../layout.svelte';
import type { IValueService } from './type';
import { ValueService } from './value-service.svelte';


export class ProjectActivity {
    readonly icon: string;
    readonly statusText: string;
    readonly header: { title: string, detail: string }

    readonly service: IValueService;
    readonly welcome: string | undefined;

    /**
     * 蓝图（术语表/元术语表/能力表）名称候选。
     * 由 main 下发的项目级配置，UI 层通过 projectStore.activity?.blueprintFilters 读取。
     * undefined = 不提供候选（工具栏退回纯文本输入）。
     */
    readonly blueprintFilters: BlueprintFilters | undefined;

    /**
     * 媒体资源字段白名单（如 ["image_path","audio_path"]）。
     * 编辑器读取 JSON 后，按此白名单筛出"素材"下拉。
     * 空数组 = 不渲染素材下拉。UI 层通过 projectStore.activity?.mediaFields 读取。
     */
    readonly mediaFields: string[];


    /**
     * 为项目区添加内建activity.
     */
    private addInternalActivity() {
        layoutStore.addActivity({
            id: "session-manager",
            icon: "IconMessageChatbot",
            label: "会话管理",
            component: SessionManager,
            header: SessionHeader,
        })
    }

    constructor(data: ProjectActivityData) {
        this.clearTop();
        this.icon = data.icon
        this.statusText = data.statusText
        this.header = data.header
        this.welcome = data.welcome

        // ── 项目级配置：只做持有，不反向调用任何 UI/route store ──
        this.blueprintFilters = data.blueprintFilters;
        this.mediaFields = data.mediaFields ?? [];

        this.service = new ValueService();

        this.addInternalActivity();
        data.activities?.forEach(act => {
            layoutStore.addActivity({
                id: act.id,
                icon: act.icon,
                label: act.label,
                component: DynEntry,
                props: {
                    ast: act.panel,
                    service: this.service
                }
            })
        })
    }

    clearTop() {
        const ids = layoutStore.topActivities.map((item) => item.id);
        ids.forEach((id) => {
            layoutStore.removeActivity(id)
        })
    }

    close() {

    }
}