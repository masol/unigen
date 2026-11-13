import { safeApi } from '$lib/utils/api';
import type { McpConnectionTestResult, McpServerConfig } from '@app/main/types';

/** 测试 MCP 连接。 */
export async function testMcpConnection(
    config: McpServerConfig,
): Promise<McpConnectionTestResult> {
    return await safeApi().system.testMcpConnection(config);
}