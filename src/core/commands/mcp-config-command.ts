import path from 'node:path';
import { projectRoot, readJson } from '../fsx.js';
import {
  addMcpServer,
  duplicateMcpServer,
  editMcpServer,
  getMcpServer,
  listMcpBackups,
  listMcpInventory,
  loginMcpServer,
  logoutMcpServer,
  removeMcpServer,
  resolveMcpScope,
  restoreMcpBackup,
  redactMcpError,
  setMcpServerEnabled,
  testMcpConnection,
  type McpPluginServerInput,
  type McpScope,
  type McpScopeOptions,
  type McpWritableScope
} from '../mcp-config/index.js';

const WRITABLE_ONLY = new Set(['add', 'edit', 'duplicate', 'enable', 'disable', 'remove', 'login', 'logout', 'backups', 'restore']);
const MAX_STDIN_JSON_BYTES = 64 * 1024;

export async function mcpConfigCommand(args: string[] = []): Promise<unknown> {
  const result = await executeMcpConfigCommand(args);
  console.log(JSON.stringify(result, null, 2));
  if (!isOk(result)) process.exitCode = 1;
  return result;
}

export async function executeMcpConfigCommand(args: string[] = [], input: { stdinJson?: unknown } = {}): Promise<unknown> {
  const [surface = 'config', actionInput = 'list', ...rest] = args;
  if (surface !== 'config') return usage('mcp_config_surface_required');
  const action = String(actionInput || 'list').toLowerCase();
  const scope = scopeFrom(rest, action);
  if (!scope) return failure('mcp_scope_invalid');
  if (scope === 'effective' && WRITABLE_ONLY.has(action)) return failure('mcp_effective_scope_read_only');

  const options = await scopeOptions(rest, scope);
  const plugins = scope === 'effective' ? await pluginServers(rest) : [];
  const inventoryOptions = { ...options, ...(plugins.length ? { pluginServers: plugins } : {}) };
  const writable = scope === 'effective' ? null : scope;

  try {
    if (action === 'list') return listMcpInventory(scope, inventoryOptions);
    if (action === 'get') {
      const name = positional(rest, 0);
      if (!name) return failure('mcp_server_name_required');
      const server = await getMcpServer(name, scope, inventoryOptions);
      return { schema: 'sks.mcp-config-get.v1', ok: Boolean(server), scope, server, blockers: server ? [] : ['mcp_server_not_found'] };
    }
    if (action === 'test') {
      const name = positional(rest, 0);
      if (!name) return failure('mcp_server_name_required');
      return testMcpConnection(name, scope, inventoryOptions);
    }
    if (!writable) return failure('mcp_effective_scope_read_only');
    if (action === 'add') return addMcpServer(await mutationPayload(rest, input), writable, options);
    if (action === 'edit') {
      const name = positional(rest, 0);
      if (!name) return failure('mcp_server_name_required');
      return editMcpServer(name, await mutationPayload(rest, input), writable, options);
    }
    if (action === 'duplicate') {
      const source = positional(rest, 0);
      const target = readOption(rest, '--new-name') || positional(rest, 1);
      if (!source || !target) return failure('mcp_duplicate_source_and_new_name_required');
      return duplicateMcpServer(source, target, writable, options);
    }
    if (action === 'enable' || action === 'disable') {
      const name = positional(rest, 0);
      if (!name) return failure('mcp_server_name_required');
      return setMcpServerEnabled(name, action === 'enable', writable, options);
    }
    if (action === 'remove') {
      const name = positional(rest, 0);
      if (!name) return failure('mcp_server_name_required');
      return removeMcpServer(name, writable, options);
    }
    if (action === 'login' || action === 'logout') {
      const name = positional(rest, 0);
      if (!name) return failure('mcp_server_name_required');
      return action === 'login'
        ? loginMcpServer(name, writable, options, listOption(rest, '--oauth-scope'))
        : logoutMcpServer(name, writable, options);
    }
    if (action === 'backups') {
      const ref = await resolveMcpScope(writable, options);
      const backups = await listMcpBackups(ref);
      return { schema: 'sks.mcp-backup-list.v1', ok: true, scope: writable, backups, blockers: [] };
    }
    if (action === 'restore') {
      const backupId = positional(rest, 0);
      if (!backupId) return failure('mcp_backup_id_required');
      return restoreMcpBackup(backupId, writable, options);
    }
    return usage('unknown_mcp_config_action');
  } catch (error) {
    const publicError = redactMcpError(error);
    const blocker = /^mcp_[a-z0-9_]+$/.test(publicError) ? publicError : 'mcp_config_command_failed';
    return failure(blocker, blocker === publicError ? null : publicError);
  }
}

async function scopeOptions(args: readonly string[], scope: McpScope): Promise<McpScopeOptions> {
  const explicitProjectRoot = readOption(args, '--project-root');
  const project = scope === 'global'
    ? null
    : path.resolve(explicitProjectRoot || await projectRoot());
  const home = readOption(args, '--home');
  const codexPath = readOption(args, '--codex');
  return {
    ...(home ? { home: path.resolve(home) } : {}),
    ...(project ? { projectRoot: project } : {}),
    ...(project ? { projectTrusted: hasFlag(args, '--trusted-project') } : {}),
    ...(scope === 'project' && (hasFlag(args, '--yes') || hasFlag(args, '--confirm-project')) ? { confirmProjectMutation: true } : {}),
    ...(codexPath ? { codexPath: path.resolve(codexPath) } : {})
  };
}

async function pluginServers(args: readonly string[]): Promise<McpPluginServerInput[]> {
  const explicit = readOption(args, '--plugin-inventory');
  const root = readOption(args, '--project-root') || await projectRoot().catch(() => null);
  const file = explicit
    ? path.resolve(explicit)
    : root ? path.join(path.resolve(root), '.sneakoscope', 'mcp-plugin-server-candidates.json') : '';
  if (!file) return [];
  const value = await readJson<any>(file, null);
  if (value?.schema !== 'sks.mcp-plugin-server-candidates.v1' || !Array.isArray(value.candidates)) return [];
  return value.candidates.map((candidate: any) => ({
    name: String(candidate?.name || ''),
    enabled: false,
    ...(typeof candidate?.url === 'string' && candidate.url ? { url: candidate.url } : {}),
    oauthSupported: /oauth/i.test(String(candidate?.auth_type || '')),
    authenticated: null,
    sourcePath: `plugin:${String(candidate?.plugin_id || 'unknown')}`
  })).filter((candidate: McpPluginServerInput) => candidate.name);
}

async function mutationPayload(args: readonly string[], input: { stdinJson?: unknown }): Promise<unknown> {
  if (!hasFlag(args, '--stdin-json')) throw new Error('mcp_stdin_json_required');
  if (input.stdinJson !== undefined) return input.stdinJson;
  if (process.stdin.isTTY) throw new Error('mcp_stdin_json_required');
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_STDIN_JSON_BYTES) throw new Error('mcp_stdin_json_too_large');
    chunks.push(buffer);
  }
  return parseMcpStdinJson(Buffer.concat(chunks));
}

export function parseMcpStdinJson(input: string | Buffer): unknown {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buffer.length > MAX_STDIN_JSON_BYTES) throw new Error('mcp_stdin_json_too_large');
  const text = buffer.toString('utf8').trim();
  if (!text) throw new Error('mcp_stdin_json_required');
  try { return JSON.parse(text); }
  catch { throw new Error('mcp_stdin_json_invalid'); }
}

function scopeFrom(args: readonly string[], action: string): McpScope | null {
  const value = String(readOption(args, '--scope') || (WRITABLE_ONLY.has(action) ? 'global' : 'effective')).toLowerCase();
  return value === 'global' || value === 'project' || value === 'effective' ? value : null;
}

function positional(args: readonly string[], index: number): string | null {
  const values: string[] = [];
  for (let cursor = 0; cursor < args.length; cursor += 1) {
    const value = String(args[cursor] || '');
    if (value.startsWith('--')) {
      if (!['--yes', '--confirm-project', '--trusted-project', '--stdin-json', '--json'].includes(value)) cursor += 1;
      continue;
    }
    values.push(value);
  }
  return values[index] || null;
}

function readOption(args: readonly string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? String(args[index + 1]) : null;
}

function listOption(args: readonly string[], name: string): string[] {
  const value = readOption(args, name);
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 32) : [];
}

function hasFlag(args: readonly string[], name: string): boolean { return args.includes(name); }
export function isMcpCommandSuccess(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  if (typeof result.ok === 'boolean') return result.ok;
  if (result.schema === 'sks.mcp-health.v1') {
    return result.status === 'healthy' || result.status === 'disabled' || result.status === 'oauth_required';
  }
  return false;
}
function isOk(value: unknown): boolean { return isMcpCommandSuccess(value); }
function failure(blocker: string, publicError: string | null = null) {
  return { schema: 'sks.mcp-config-command.v1', ok: false, blockers: [blocker], public_error: publicError };
}
function usage(blocker: string) {
  return {
    schema: 'sks.mcp-config-command.v1', ok: false, blockers: [blocker],
    usage: 'sks mcp config list|get|add|edit|duplicate|enable|disable|remove|test|login|logout|backups|restore [--scope global|project|effective] [--json]'
  };
}
