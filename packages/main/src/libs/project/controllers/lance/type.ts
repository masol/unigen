import type { Connection } from "@lancedb/lancedb";
import type { LanceDBType } from "./lancedb.js";
import type { TableBase, TableConstructor } from "./tablebase.js";


export interface ILanceDB {
    readonly embedSize: number;
    readonly db: Connection;
    readonly lanceInst: LanceDBType;
    doEmbedding(batch: string[]): Promise<number[][]>;
    addTable<T extends TableBase>(token: TableConstructor<T>, name: string): Promise<void>;
    getTable<T extends TableBase>(token: TableConstructor<T>): T | null;
}