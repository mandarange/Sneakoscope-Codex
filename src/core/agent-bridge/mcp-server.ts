import { fileURLToPath } from 'node:url';
import { buildAgentManifest, type AgentManifestEntry } from './agent-manifest.js';
import { AGENT_MODE_ENV_PASSTHROUGH } from './agent-mode.js';
import { exists, runProcess } from '../fsx.js';

export interface RunMcpServerOptions {
  exposeExec?: boolean;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

const MCP_SERVER_NAME = 'sks-mcp-server';
const MCP_SERVER_VERSION = '1.0.0';

// Same dynamic-import trick as src/core/mad-db/mad-db-executor.ts: avoids TS
// bundling the SDK's ESM entrypoints as a static import target this file must
// resolve at compile time, while still using the real installed SDK.
async function loadMcpSdk(): Promise<{
  Server: any;
  StdioServerTransport: any;
  ListToolsRequestSchema: any;
  CallToolRequestSchema: any;
}> {
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;
  const [{ Server }, { StdioServerTransport }, types] = await Promise.all([
    dynamicImport('@modelcontextprotocol/sdk/server/index.js'),
    dynamicImport('@modelcontextprotocol/sdk/server/stdio.js'),
    dynamicImport('@modelcontextprotocol/sdk/types.js')
  ]);
  return {
    Server,
    StdioServerTransport,
    ListToolsRequestSchema: types.ListToolsRequestSchema,
    CallToolRequestSchema: types.CallToolRequestSchema
  };
}

function exposedTools(manifest: AgentManifestEntry[], exposeExec: boolean): AgentManifestEntry[] {
  return exposeExec ? manifest : manifest.filter((tool) => tool.read_only === true);
}

function toMcpToolDescriptor(entry: AgentManifestEntry): Record<string, unknown> {
  return {
    name: entry.name,
    description: entry.description,
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: true
    },
    annotations: {
      readOnlyHint: entry.read_only,
      destructiveHint: entry.requires_explicit_opt_in,
      title: entry.name
    }
  };
}

async function resolveSksEntrypoint(): Promise<string> {
  // Mirrors src/core/commands/run-command.ts's runSks() bin resolution: prefer the
  // packaged dist entrypoint, fall back to the source-tree relative path in dev.
  const packedBin = fileURLToPath(new URL('../../bin/sks.js', import.meta.url));
  const sourceBin = fileURLToPath(new URL('../../../bin/sks.js', import.meta.url));
  return (await exists(packedBin)) ? packedBin : sourceBin;
}

async function invokeSksTool(entry: AgentManifestEntry): Promise<{ ok: boolean; stdout: string; stderr: string; code: number | null }> {
  const entrypoint = await resolveSksEntrypoint();
  const commandArgs = [entry.name, ...(entry.json_output_supported ? ['--json'] : [])];
  const passthroughEnv: Record<string, string> = {};
  for (const name of AGENT_MODE_ENV_PASSTHROUGH) passthroughEnv[name] = '1';
  const result = await runProcess(process.execPath, [entrypoint, ...commandArgs], {
    env: { ...passthroughEnv, SKS_AGENT_MODE: '1' },
    timeoutMs: 180_000,
    maxOutputBytes: 512 * 1024
  });
  return { ok: result.code === 0, stdout: result.stdout, stderr: result.stderr, code: result.code };
}

function mcpToolErrorResult(message: string): Record<string, unknown> {
  return {
    content: [{ type: 'text', text: message }],
    isError: true
  };
}

export async function runMcpServer(opts: RunMcpServerOptions = {}): Promise<void> {
  const exposeExec = opts.exposeExec === true;
  const input = opts.input ?? process.stdin;
  const output = opts.output ?? process.stdout;

  const { Server, StdioServerTransport, ListToolsRequestSchema, CallToolRequestSchema } = await loadMcpSdk();

  const server = new Server(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const manifest = buildAgentManifest();
    const tools = exposedTools(manifest.tools, exposeExec).map(toMcpToolDescriptor);
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    const toolName = String(request?.params?.name || '');
    const manifest = buildAgentManifest();
    const allowed = exposedTools(manifest.tools, exposeExec);
    // Never spawn a child process for a name the caller invented; only names present
    // in the (possibly exec-filtered) manifest are legitimate `sks <name>` invocations.
    const entry = allowed.find((candidate) => candidate.name === toolName);
    if (!entry) {
      return mcpToolErrorResult(`Unknown or unexposed tool: ${toolName}`);
    }
    try {
      const result = await invokeSksTool(entry);
      if (!result.ok) {
        return mcpToolErrorResult(result.stderr || result.stdout || `sks ${toolName} exited with code ${result.code}`);
      }
      return {
        content: [{ type: 'text', text: result.stdout }],
        isError: false
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return mcpToolErrorResult(`Failed to run sks ${toolName}: ${message}`);
    }
  });

  const transport = new StdioServerTransport(input as any, output as any);
  await server.connect(transport);
}

/** Round-trips initialize -> tools/list over in-memory streams and returns, instead of
 * staying resident on real stdio — this is what `sks mcp-server --probe` runs, so a
 * fixture/CI check can prove the server actually works without hanging on a real client. */
export async function probeMcpServer(opts: { exposeExec?: boolean; timeoutMs?: number } = {}): Promise<{ ok: boolean; server_name: string | null; protocol_version: string | null; tool_count: number }> {
  const { PassThrough } = await import('node:stream');
  const clientToServer = new PassThrough();
  const serverToClient = new PassThrough();
  const responses: any[] = [];
  let buffer = '';
  serverToClient.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let idx: number;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.trim()) {
        try { responses.push(JSON.parse(line)); } catch { /* not a complete JSON line yet */ }
      }
    }
  });
  const send = (message: Record<string, unknown>) => clientToServer.write(`${JSON.stringify(message)}\n`);
  const waitForId = async (id: number, timeoutMs: number): Promise<any> => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const found = responses.find((r) => r.id === id);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`mcp_probe_timed_out_waiting_for_response_id_${id}`);
  };
  runMcpServer({ exposeExec: opts.exposeExec === true, input: clientToServer, output: serverToClient }).catch(() => undefined);
  const timeoutMs = opts.timeoutMs ?? 10_000;
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'sks-mcp-probe', version: '1.0.0' } } });
  const initResponse = await waitForId(1, timeoutMs);
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const listResponse = await waitForId(2, timeoutMs);
  clientToServer.end();
  return {
    ok: Boolean(initResponse?.result) && Array.isArray(listResponse?.result?.tools),
    server_name: initResponse?.result?.serverInfo?.name || null,
    protocol_version: initResponse?.result?.protocolVersion || null,
    tool_count: Array.isArray(listResponse?.result?.tools) ? listResponse.result.tools.length : 0
  };
}
