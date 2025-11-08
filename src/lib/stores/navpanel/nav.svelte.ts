

export const ENTITIES = "entities";  // 实体(或者称数据结构?)
export const TRANSFORM = "transform";  // 变换(或者称函数?)
export const WORKFLOW = "workflow"; // 工作流(由变换连接构成－－类似nodered,或者称程序？)

export type NavType = "entities" | "transform" | "workflow";

// 配合nav panel的当前选中panel。
export class NavStore {
    current = $state<NavType>(ENTITIES); // 当前选中的分类。

    // 设置当前选中分类。
    setCurnav(nav: NavType) {
        this.current = nav;
    }
}



export const navStore = new NavStore();