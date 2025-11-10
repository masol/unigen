export type WordType = "entity" | "predict" | "flow";
export const TypeEntity: WordType = "entity"
export const TypePredict: WordType = "predict"
export const TypeFlow: WordType = "flow" // 

// 基础数据接口，@todo: 是否需要语义搜索？
export interface WordData {
    id: number; // 自增id.
    // concept_id: number; // 以 
    word: string; // 可以为空，表示无自然语言对应--需要用句子来
    definition: string;
    lang: string; // 词汇定义时，使用的语言
    synonym: string[];
    expand: boolean;
    type: WordType;
}


export interface EntityData extends WordData {
    type: "entity";
    example?: string[]; // 示例性的内容．如果以file://开头，指示本地文件(想对于项目路径/gitdata)
    compose?: string[]; // 组成成分．值为id,指向了entity id．
    // belongto?: string; // 所属entity,值为id.指向了WordData中的entity．
}


export interface FlowData extends WordData {
    type: "flow";
}