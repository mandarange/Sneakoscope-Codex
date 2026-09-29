import os from 'node:os';
import path from 'node:path';
import {
  addMcpServer,
  listMcpInventory,
  MCP_MUTATION_SCHEMA,
  removeMcpServer,
  setMcpServerEnabled,
  type McpMutationResultV2,
  type McpMutationOptions,
  type CodexMcpCliPort
} from '../mcp-config/index.js';
import { isRecord } from '../json/records.js';

export const CODEX_MCP_MUTATION_SCHEMA = MCP_MUTATION_SCHEMA;

export interface CodexMcpManagerOptions {
  readonly home?: string;
  readonly configPath?: string;
  readonly root?: string;
  readonly codexPath?: string;
  readonly cli?: CodexMcpCliPort;
}

export function codexMcpConfigPath(homeInput?: string): string {
  const home = path.resolve(homeInput || process.env.HOME || os.homedir());
  return path.join(home, '.codex', 'config.toml');
}

export async function listCodexMcpServers(options: CodexMcpManagerOptions = {}) {
  const normalized = scopeOptions(options);
  const inventory = await listMcpInventory('global', normalized);
  return {
    ...inventory,
    config_path: codexMcpConfigPath(normalized.home),
    warnings: [...inventory.warnings]
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
    enabled,
    config_path: codexMcpConfigPath(scopeOptions(options).home),
    warnings: [...result.warnings]
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
    servers: [],
    blockers,
    warnings: [],
    attempts: 0,
    public_error: null
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

export * from '../mcp-config/index.js';
