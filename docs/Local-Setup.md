# 💻 本地环境配置（从源码构建）

本页以 **Ubuntu** 为例。Windows / macOS 构建流程类似，差异在系统依赖一节。

## 前置要求

- **Node.js 22**（建议用 nvm 安装）
- npm（随 Node 附带）
- git

## 构建步骤

### 1. 克隆与安装依赖

```bash
git clone https://github.com/masol/unigen.git
cd unigen
npm i
```

### 2. 安装 Linux 系统依赖（Electron 运行所需）

```bash
sudo apt-get update
sudo apt-get install -y \
  libgtk-3-0 \
  libnotify4 \
  libnss3 \
  libxss1 \
  libasound2t64 \
  libxtst6 \
  xauth \
  libgbm1
```

### 3. 校验原生模块

Unigen 依赖多个原生模块，它们都必须能够在当前 Node 环境正常加载：

- **better-sqlite3**：结构化存储
- **@lancedb/lancedb**：向量存储
- **node-llama-cpp**：本地 LLM 推理

先确认它们均能正常加载：

```bash
node -e "require('better-sqlite3'); console.log('better-sqlite3 OK')"
node -e "require('@lancedb/lancedb'); console.log('lancedb OK')"
node -e "require('node-llama-cpp'); console.log('node-llama-cpp OK')"
```

如果其中任何一步报错，请先解决依赖安装问题，再继续后续步骤。

### 4. 为 Electron 重建原生模块

所有原生模块都必须针对 **Electron 的 ABI** 重新编译（这是编译失败最常见的问题）：

```bash
npx electron-builder install-app-deps
```

该命令会自动重建项目中的所有原生模块，包括：

- `better-sqlite3`
- `@lancedb/lancedb`
- `node-llama-cpp`
- 以及其他通过 `node-gyp` 或 `prebuild` 提供的原生扩展

### 5. 验证 Electron

```bash
ELECTRON_DISABLE_SANDBOX=1 npx electron --version
```

> `ELECTRON_DISABLE_SANDBOX=1` 仅在无头（Headless）或 CI 环境需要，桌面环境可省略。

### 6. 编译

```bash
npm run compile
```

构建产物位于 `dist/` 目录。

### 7. 本地运行

```bash
npm run dev
```

## 常见问题

### 原生模块 ABI 不匹配（`NODE_MODULE_VERSION`）

如果启动时出现类似：

```
Error: The module 'xxx.node'
was compiled against a different Node.js version using
NODE_MODULE_VERSION xxx.
```

通常表示原生模块是针对 **Node.js** 编译的，而当前运行的是 **Electron**。

确认：

- 使用 **Node.js 22**（与项目要求一致）
- 已执行：

```bash
npx electron-builder install-app-deps
```

如果仍然存在问题，可删除 `node_modules` 后重新安装依赖，并再次执行 `install-app-deps`。

### `node-llama-cpp` 加载失败

如果只有 `node-llama-cpp` 无法加载：

- 确认第 3 步中的 `require('node-llama-cpp')` 能够成功执行。
- 确认 `install-app-deps` 已完成 Electron ABI 重建。
- Linux 平台还需要确保系统安装了 `node-llama-cpp` 所需的运行时依赖（如 `libstdc++` 等）。

### Linux 缺少系统库

如果 Electron 启动时报缺少 `libgbm.so.1`、`libnss3.so` 等系统库，请返回第 2 步安装对应的系统依赖。
