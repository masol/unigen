import type { EntityData } from "$lib/utils/vocab/type";

export class EntityStore {
    entities = $state<EntityData[]>([
        {
            id: 1,
            word: '用户',
            definition: '系统使用者',
            lang: 'zh-CN',
            synonym: ['User', '使用者'],
            expand: true,
            type: "entity",
            example: ['张三', '李四'],
            compose: []
        },
        {
            id: 2,
            word: '产品',
            definition: '商品信息',
            lang: 'zh-CN',
            synonym: ['Product', '商品'],
            expand: false,
            type: "entity",
            compose: []
        },
        {
            id: 3,
            word: '订单',
            definition: '购买记录',
            lang: 'zh-CN',
            synonym: ['Order'],
            expand: false,
            type: "entity",
            compose: []
        }
    ]);

    toggleExpand(entityId: number) {
        const entity = this.entities.find(e => e.id === entityId);
        if (entity) {
            entity.expand = !entity.expand;
        }
    }
}

export function getViewId(entityId: number): string {
    return `ent::${entityId}`
}

export const entityStore = new EntityStore();

