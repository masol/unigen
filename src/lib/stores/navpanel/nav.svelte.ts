
export const ENTITIES = "entities";  // 实体(或者称数据结构?)
export const TRANSFORM = "transformer";  // 变换(或者称函数?)
export const FLOWCHART = "flowchart"; // 流程图(由变换连接构成)
export const WORKFLOW = "workflow"; // 工作流(更宏观的组织－－定义了用户参与方式)
export const UI = "ui"; // 用户界面，只有工作流才需要定制用户接口--一个用户接口配合一个用户任务．


export type NavType = "entities" | "transformer" | "workflow" | "flowchart" | "ui";

// 配合nav panel的当前选中panel。
export class NavStore {
    current = $state<NavType>(FLOWCHART); // 当前选中的分类。
    filter = $state<string>(""); // 筛选内容．

    // 设置当前选中分类。
    setCurnav(nav: NavType) {
        if (this.current !== nav) {
            this.filter = ""
            this.current = nav;
        }
    }


    setFilter(filter: string) {
        this.filter = filter;
    }
}



export const navStore = new NavStore();