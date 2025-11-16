export type WordType = "entity" | "functor" | "flow";
export const TypeEntity: WordType = "entity"
export const TypeFunctor: WordType = "functor"
export const TypeFlow: WordType = "flow"
export const wordTypeValues = [TypeEntity, TypeFunctor, TypeFlow] as const;

export function isWordType(value: string): value is WordType {
    return wordTypeValues.includes(value as WordType);
}

// 基础数据接口，@todo: 是否需要语义搜索？是否需要维护全局而非项目级的词语(实体/概念)表？
export interface WordData {
    id: string; // UUID.
    concept_id: number; // 以自增id，方便将word映射到prolog中． 
    word: string; // 可以为空，表示无自然语言对应--需要用句子来
    definition?: string;
    lang: string; // 词汇定义时，使用的语言
    synonym?: string[];
    type: WordType;
    created_at: number;
    updated_at: number;
    extra?: unknown;
}


export interface EntityData extends WordData {
    type: "entity";
    extra?: {
        example?: string[]; // 示例性的内容．如果以file://开头，指示本地文件(想对于项目路径/gitdata)
        compose?: string[]; // 组成成分．值为id,指向了entity id．
    }
    // belongto?: string; // 所属entity,值为id.指向了WordData中的entity．
}


export interface FlowData extends WordData {
    type: "flow";
}


export interface FunctorData extends WordData {
    type: "functor";
    // extra: {
    //     sub_type: string; // 函子类型，当前只支持一个，就是Prompt funciton.不给默认就是Prompt funciton.
    // }
}
