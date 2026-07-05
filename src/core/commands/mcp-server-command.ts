import { runMcpServer } from '../agent-bridge/mcp-server.js';
import { flag } from './command-utils.js';

export async function mcpServerCommand(args: readonly string[] = []): Promise<void> {
  const exposeExec = flag(args, '--expose-exec');
  await runMcpServer({ exposeExec });
}
