import { AsyncParallelHook, AsyncSeriesHook } from 'tapable';

// 可以通过getCurrentProject获取当前项目，进而获取到orchestrator等数据。
class TaskLife {
    readonly hooks;
    constructor() {
        this.hooks = {
            /**
             * ==========================================
             * 1. 初始化阶段 (全局串联)
             * ==========================================
             */
            // 允许各模块并行处理异步初始化（查库/读配置），系统死等所有人 ready
            onRegisterWorkers: new AsyncParallelHook(['orchestrator']),


            /**
             * ==========================================
             * 2. 任务投递流水线 (唯一允许修改 jobData 的地方)
             * ==========================================
             */
            // ⚡ 核心新增：专门用于异步串行清洗、处理、转换数据（Pipeline 模式）
            // 后面插件接收到的 jobData 是前一个插件处理完的成品
            transform: new AsyncSeriesHook(['jobData']),


            /**
             * ==========================================
             * 3. 状态事件广播处理 (全部为只读通知，严禁修改数据，全部并行化 ⚡)
             * ==========================================
             */
            // ⚡ 拆分后：数据已定型，入库前的最后只读通知（例如审计日志、UI 提前占位）。异步并行。
            beforeAdd: new AsyncParallelHook(['readonlyJobData']),

            // ⚡ 修正：任务由 Worker 认领开始跑。异步并行，允许消费端做异步记录或通知，互不干扰。
            onStart: new AsyncParallelHook(['jobInfo']),

            // 任务顺利结束。异步并行（UI 推送、结果持久化、图表统计并发执行）。
            onCompleted: new AsyncParallelHook(['jobResult']),

            // ⚡ 修正：任务失败通知。异步并行，允许各插件并发处理警报、异步写错误日志等。
            onFailed: new AsyncParallelHook(['jobError']),
        };
    }
}

export const taskLife = new TaskLife();
