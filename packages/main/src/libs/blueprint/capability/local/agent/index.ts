// packages/main/src/libs/blueprint/capability/local/agent/index.ts
/**
  ├── types.ts          # 类型 + IAgentExecutor 接口
  ├── core.ts           # PacAgent 类 
  ├── execution.ts      # executeAgent 编排 
  ├── lifecycle.ts      # Trace 生命周期
  ├── history.ts        # 历史管理 
  ├── executor.ts       # streamAgent / generateAgent 
  ├── tools.ts          # materializeTools / buildAgentTool 
  ├── callbacks.ts      # onToolExecutionStart/End 
  └── buffer.ts         # MessageDeltaBuffer

 */
export { PacAgent } from "./core.js";
export { buildAgentTool } from "./tools.js";
export type { PacRunState } from "./types.js";

