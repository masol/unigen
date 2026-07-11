

import type { ProjectType } from "@app/main/types";

export type { ProjectType };

/** 在线项目类型:在本地字段基础上带安装态与统计信息。 */
export interface RemoteProjectType extends ProjectType {
    installed: boolean;
    downloads?: number;
    updatedAt?: string;
}