import { safeApi } from '$lib/utils/api';
import type { McpConnectionTestResult, McpServerConfig } from '@app/main/types';

/**
 * 测试 MCP 连接。
 *
 * TODO: 接入主进程真实 MCP 连接测试 RPC。
 * 当前返回稳定假数据，仅用于界面确认连接状态与工具展示，不持久化。
 */
export async function testMcpConnection(
    config: McpServerConfig,
): Promise<McpConnectionTestResult> {
    await new Promise((resolve) => setTimeout(resolve, 650));

    return await safeApi().system.testMcpConnection(config)
}