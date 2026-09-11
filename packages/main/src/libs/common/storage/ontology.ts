/**
 * 设计：每个配置项一个独立 key（config:weave:XXX）。
 * 缺省值由各调用方在读取时自行提供——本类只负责 KV 存取。
 */

import { BaseStorage } from "./base.js";

export class GoalStorage extends BaseStorage {
    protected NS = "#common:ontology:";


    // ========== 新增配置项 ==========
    // 以下每个配置项均为字符串类型，提供 get 和 set 方法。
    // get 方法支持传入默认值，若未设置则返回默认值（或空字符串）。

    getOntologyAnalysis(defaultValue = ""): string {
        return this.get<string>("ontology_analysis") ?? defaultValue;
    }

    setOntologyAnalysis(value: string): void {
        this.set("ontology_analysis", value);
    }

    getTerminologyTable(defaultValue = ""): string {
        return this.get<string>("terminology_table") ?? defaultValue;
    }

    setTerminologyTable(value: string): void {
        this.set("terminology_table", value);
    }

    getReaderAssumptions(defaultValue = ""): string {
        return this.get<string>("reader_assumptions") ?? defaultValue;
    }

    setReaderAssumptions(value: string): void {
        this.set("reader_assumptions", value);
    }

    getWritingStyle(defaultValue = ""): string {
        return this.get<string>("writing_style") ?? defaultValue;
    }

    setWritingStyle(value: string): void {
        this.set("writing_style", value);
    }

    getFormatRules(defaultValue = ""): string {
        return this.get<string>("format_rules") ?? defaultValue;
    }

    setFormatRules(value: string): void {
        this.set("format_rules", value);
    }

    getProhibitions(defaultValue = ""): string {
        return this.get<string>("prohibitions") ?? defaultValue;
    }

    setProhibitions(value: string): void {
        this.set("prohibitions", value);
    }

    getLogicRelations(defaultValue = ""): string {
        return this.get<string>("logic_relations") ?? defaultValue;
    }

    setLogicRelations(value: string): void {
        this.set("logic_relations", value);
    }
}