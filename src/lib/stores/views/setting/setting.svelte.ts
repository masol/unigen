


// 配合view页面的设置存储。
export class SettingStore {
    curCate = $state<string>("llm"); // 当前选中的分类。

    // 设置当前选中分类。
    setCurcate(cate: string) {
        this.curCate = cate;
    }
}



export const settingStore = new SettingStore();