/**
 * 设计：每个配置项一个独立 key（config:weave:XXX）。
 * 缺省值由各调用方在读取时自行提供——本类只负责 KV 存取。
 */

import { throwNotfound, throwUnprcessable } from "$libs/utils/err.js";
import { BaseStorage } from "./base.js";
import { DocumentSplitConstitution } from "./type/ontology.js";
import { ExecInput } from "./type/tast.js";

export type SubOntology = "terminology" | "reader_assumptions" | "writing_style" | "format_rules" | "prohibitions" | "logic_relations" | "methodology" | "method-unit";


export class GoalStorage extends BaseStorage {
    protected NS = "#common:goal:";

    // ========== 原有方法（不变） ==========
    getCurgoal(bthrow = true): ExecInput {
        const result = this.get<ExecInput>("curgoal");
        if (!result) {
            if (bthrow) {
                throwNotfound("尝试获取当前目标，但是未设置当前目标。");
            }
            return {
                goal: "",
                target_user: "",
                use_scenario: ""
            };
        }
        return result;
    }

    setCurgoal(input: ExecInput): void {
        this.set("curgoal", input);
    }

    // ========== 新增配置项 ==========
    // 以下每个配置项均为字符串类型，提供 get 和 set 方法。
    // get 方法支持传入默认值，若未设置则返回默认值（或空字符串）。

    getOntologyAnalysis(defaultValue = ""): string {
        return this.get<string>("ontology_analysis") ?? defaultValue;
    }

    setOntologyAnalysis(value: string): void {
        this.set("ontology_analysis", value);
    }


    getOntology(): DocumentSplitConstitution {
        const result = this.get<DocumentSplitConstitution>("ontology");
        if (!result) {
            throwUnprcessable("未找到文档拆分宪法，请先创建文档拆分宪法。");
        }
        return result;
    }

    setOntology(value: DocumentSplitConstitution): void {
        this.set("ontology", value);
    }

    getOntologySub(subName: SubOntology, defaultValue = ""): string {
        return this.get<string>(subName) ?? defaultValue;
    }

    setOntologySub(subName: SubOntology, value: string): void {
        this.set(subName, value);
    }
}