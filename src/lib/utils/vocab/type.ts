// import {type DepGraph} from 'dependency-graph';
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

type IoBaseType = {
    entId?: string; // 引用的entity id.
    name: string; // 或者命名为类型?类别?.
    extractor?: string; // 用于抽取所需信息的提示词-如无，使用标准抽取提示词．
    definition?: string; // 概念内涵．
    sample?: string; // 原始的案例(name所指向的内容)．
    reward?: string; // 奖励函数(判断是否是一个好的)--如果未给出，使用标准reward.
}

type IoType<T extends 'input' | 'output' | 'process'> = IoBaseType & {
    type: T;
}

export type InputType = IoType<'input'> & {}
export type OutputType = IoType<'output'> & {}
export type ProcessType = IoType<'process'> & {}

export interface FunctorData extends WordData {
    type: "functor";
    extra?: {
        sub_type?: string; // 函子类型，当前只支持一个，就是Prompt funciton.不给默认就是Prompt funciton.
        inputs?: InputType[];
        // template: string; // 编译后的模板存入definition中．
        // inputDeps?: DepGraph<string>; // 暂不支持嵌套inputs.
        output?: OutputType;
        process?: ProcessType;
        source?: string; // md string source.
    }
}
