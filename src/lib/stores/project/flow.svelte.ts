
import type { FlowData } from "$lib/utils/vocab/type";

export class FlowStore {
    items = $state<FlowData[]>([
        {
            id: 1,
            word: '用户',
            definition: '系统使用者',
            lang: 'zh-CN',
            synonym: ['User', '使用者'],
            expand: true,
            type: "flow"
        },
        {
            id: 2,
            word: '产品',
            definition: '商品信息',
            lang: 'zh-CN',
            synonym: ['Product', '商品'],
            expand: false,
            type: "flow"
        },
        {
            id: 3,
            word: '订单',
            definition: '购买记录',
            lang: 'zh-CN',
            synonym: ['Order'],
            expand: false,
            type: "flow"
        }
    ]);


    toggleExpand(id: number) {
        const item = this.items.find(e => e.id === id);
        if (item) {
            item.expand = !item.expand;
        }
    }
}

export function getViewIdPrefixOfFlow(id: number): string {
    return `flow_${id}::`
}

export function getViewIdOfFlow(id: number): string {
    return `${getViewIdPrefixOfFlow(id)}flow`
}


export const flowStore = new FlowStore();