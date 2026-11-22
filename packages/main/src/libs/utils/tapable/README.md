# 主进程 Hook 扩展指南

## 概述

主进程 hook 体系基于 [`hookable`](https://github.com/unjs/hookable)，
通过 `AsyncParallelHook` / `AsyncSeriesHook` 两个适配器对外暴露 tapable 风格接口(历史使用的tapable,其高性能特性对unigen意义不大，但是无法动态插拔限制过大，故迁移至hookable,为兼容历史代码，添加此适配器)
（`tap` / `tapPromise` / `untap` / `untapAll`）。

- **并行 hook**（`AsyncParallelHook`）：底层 `callHookParallel`，所有回调并发执行。
  适合清理 / 通知类任务，回调之间**无顺序依赖**。
- **串行 hook**（`AsyncSeriesHook`）：底层 `callHook`，按注册顺序 `await`。
  适合有前后依赖的变换链。

> 关键事实：`hookable` 的默认 `callHook` 是**串行**的。名字看起来并行，
> 但是真正并发要显式调用 `callHookParallel`。
> 包装层已对齐了语义（已在类型/注释里说明）。

## 注册一个清理回调

```ts
import { appLife } from "$libs/utils/tapable/applife.js";

const unregister = appLife.beforeQuit.tapPromise("MyWorker", async () => {
  await myWorker.dispose();
});

// 任务/模块销毁时注销，避免内存泄漏（推荐）
unregister();

// 或者按名称批量注销（同名多次注册会被一起清掉）
// appLife.beforeQuit.untap("MyWorker");
```
