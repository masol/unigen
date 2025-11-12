
import type { FunctorData } from "$lib/utils/vocab/type";

export class FunctorStore {
    items = $state<FunctorData[]>([
        {
            id: 1,
            word: '用户',
            definition: '系统使用者',
            lang: 'zh-CN',
            synonym: ['User', '使用者'],
            expand: true,
            type: "functor"
        },
        {
            id: 2,
            word: '产品',
            definition: '商品信息',
            lang: 'zh-CN',
            synonym: ['Product', '商品'],
            expand: false,
            type: "functor"
        },
        {
            id: 3,
            word: '订单',
            definition: '购买记录',
            lang: 'zh-CN',
            synonym: ['Order'],
            expand: false,
            type: "functor"
        }
    ]);


    toggleExpand(id: number) {
        const item = this.items.find(e => e.id === id);
        if (item) {
            item.expand = !item.expand;
        }
    }
}

export function getViewIdOfFunctor(id: number): string {
    return `functor::${id}`
}

export const functorStore = new FunctorStore();