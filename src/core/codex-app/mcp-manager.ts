import os from 'node:os';
import path from 'node:path';
import {
  addMcpServer,
  listMcpInventory,
  removeMcpServer,
  setMcpServerEnabled,
  type McpMutationResultV2,
  type McpMutationOptions,
  type CodexMcpCliPort,
  type McpServerConfigV2
} from '../mcp-config/index.js';

export const CODEX_MCP_LIST_SCHEMA = 'sks.menubar-mcp-list.v1';
export const CODEX_MCP_MUTATION_SCHEMA = 'sks.menubar-mcp-mutation.v1';

export interface CodexMcpManagerOptions {
  readonly home?: string;
  readonly configPath?: string;
  readonly root?: string;
  readonly codexPath?: string;
  readonly cli?: CodexMcpCliPort;
}

export interface CodexMcpAddInput {
  readonly name: string;
  readonly transport: 'stdio' | 'url' | 'streamable-http';
  readonly command?: string;
  readonly args?: string[];
  readonly env_vars?: string[];
  readonly env?: Record<string, string>;
  readonly cwd?: string;
  readonly url?: string;
  readonly bearer_token_env_var?: string;
  readonly startup_timeout_sec?: number;
  readonly tool_timeout_sec?: number;
  readonly enabled_tools?: string[];
  readonly disabled_tools?: string[];
  readonly default_tools_approval_mode?: 'auto' | 'prompt' | 'writes' | 'approve' | 'deny';
  readonly required?: boolean;
}

export interface CodexMcpServerSummary {
  readonly name: string;
  readonly enabled: boolean;
  readonly transport: 'stdio' | 'url' | 'unknown';
  readonly command: string | null;
  readonly argument_count: number;
  readonly env_keys: string[];
  readonly url: string | null;
  readonly bearer_token_env_var: string | null;
  readonly startup_timeout_sec: number | null;
  readonly tool_timeout_sec: number | null;
  readonly summary: string;
}

export function codexMcpConfigPath(homeInput?: string): string {
  const home = path.resolve(homeInput || process.env.HOME || os.homedir());
  return path.join(home, '.codex', 'config.toml');
}

export async function listCodexMcpServers(options: CodexMcpManagerOptions = {}) {
  const normalized = scopeOptions(options);
  const inventory = await listMcpInventory('global', normalized);
  const servers = inventory.servers.map(summary);
  return {
    schema: CODEX_MCP_LIST_SCHEMA,
    ok: inventory.ok,
    scope: 'global',
    source: inventory.source,
    config_path: codexMcpConfigPath(normalized.home),
    server_count: servers.length,
    enabled_count: servers.filter((server) => server.enabled).length,
    servers,
    blockers: inventory.blockers,
    warnings: [...new Set([...inventory.warnings, 'menubar_mcp_alias_deprecated_use_sks_mcp_config'])]
  };
}

export async function addCodexMcpServer(input: unknown, options: CodexMcpManagerOptions = {}) {
  if (isRecord(input) && 'env' in input) return compatibilityFailure('add', null, options, ['mcp_raw_secret_storage_forbidden']);
  const normalized = isRecord(input)
    ? { ...input, transport: input.transport === 'url' ? 'streamable-http' : input.transport }
    : input;
  return compatibilityMutation(await addMcpServer(normalized, 'global', scopeOptions(options)), options);
}

export async function setCodexMcpServerEnabled(name: unknown, enabled: boolean, options: CodexMcpManagerOptions = {}) {
  return compatibilityMutation(await setMcpServerEnabled(name, enabled, 'global', scopeOptions(options)), options, enabled);
}

export async function removeCodexMcpServer(name: unknown, options: CodexMcpManagerOptions = {}) {
  return compatibilityMutation(await removeMcpServer(name, 'global', scopeOptions(options)), options);
}

function compatibilityMutation(result: McpMutationResultV2, options: CodexMcpManagerOptions, enabled: boolean | null = null) {
  return {
    ...result,
    schema: CODEX_MCP_MUTATION_SCHEMA,
    enabled,
    config_path: codexMcpConfigPath(scopeOptions(options).home),
    servers: result.servers.map(summary),
    warnings: [...new Set([...result.warnings, 'menubar_mcp_alias_deprecated_use_sks_mcp_config'])]
  };
}

function compatibilityFailure(action: string, name: string | null, options: CodexMcpManagerOptions, blockers: string[]) {
  return {
    schema: CODEX_MCP_MUTATION_SCHEMA,
    ok: false,
    action,
    name,
    enabled: null,
    scope: 'global',
    config_path: codexMcpConfigPath(scopeOptions(options).home),
    changed: false,
    official_cli_used: false,
    fallback_used: false,
    backup_id: null,
    restart_required: false,
    servers: [] as CodexMcpServerSummary[],
    blockers,
    warnings: ['menubar_mcp_alias_deprecated_use_sks_mcp_config'],
    attempts: 0,
    public_error: null
  };
}

function summary(server: McpServerConfigV2): CodexMcpServerSummary {
  const transport = server.transport === 'streamable-http' ? 'url' : server.transport === 'stdio' ? 'stdio' : 'unknown';
  const command = server.command || null;
  const url = server.url || null;
  return {
    name: server.name,
    enabled: server.enabled,
    transport,
    command,
    argument_count: server.args?.length || 0,
    env_keys: [...new Set([...(server.env_vars || []), ...server.legacy_env_keys])].sort(),
    url,
    bearer_token_env_var: server.bearer_token_env_var || null,
    startup_timeout_sec: server.startup_timeout_sec,
    tool_timeout_sec: server.tool_timeout_sec,
    summary: transport === 'url'
      ? `Remote · ${url || 'URL configured'}`
      : transport === 'stdio'
        ? `Local · ${command || 'configured command'}${server.args?.length ? ` · ${server.args.length} args` : ''}`
        : 'Configuration requires review'
  };
}

function scopeOptions(options: CodexMcpManagerOptions): McpMutationOptions {
  const inferredHome = options.configPath ? path.dirname(path.dirname(path.resolve(options.configPath))) : undefined;
  const home = options.home || inferredHome;
  return {
    ...(home ? { home } : {}),
    ...(options.codexPath ? { codexPath: options.codexPath } : {}),
    ...(options.cli ? { cli: options.cli } : {})
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export * from '../mcp-config/index.js';
