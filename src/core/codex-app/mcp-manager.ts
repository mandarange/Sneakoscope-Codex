import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readText } from '../fsx.js';
import { writeCodexConfigGuarded } from '../codex/codex-config-guard.js';
import { parseCodexConfigToml } from '../codex/codex-config-toml.js';
import { withFileLock } from '../locks/file-lock.js';

export const CODEX_MCP_LIST_SCHEMA = 'sks.menubar-mcp-list.v1';
export const CODEX_MCP_MUTATION_SCHEMA = 'sks.menubar-mcp-mutation.v1';

export interface CodexMcpManagerOptions {
  home?: string;
  configPath?: string;
  root?: string;
}

export interface CodexMcpAddInput {
  name: string;
  transport: 'stdio' | 'url';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  bearer_token_env_var?: string;
  startup_timeout_sec?: number;
  tool_timeout_sec?: number;
}

export interface CodexMcpServerSummary {
  name: string;
  enabled: boolean;
  transport: 'stdio' | 'url' | 'unknown';
  command: string | null;
  argument_count: number;
  env_keys: string[];
  url: string | null;
  bearer_token_env_var: string | null;
  startup_timeout_sec: number | null;
  tool_timeout_sec: number | null;
  summary: string;
}

interface TableSpan {
  start: number;
  headerEnd: number;
  end: number;
  path: string[];
  array: boolean;
}

interface SourceLine {
  start: number;
  end: number;
  content: string;
}

type TomlMultilineState = 'normal' | 'multiline-basic' | 'multiline-literal';

export function codexMcpConfigPath(homeInput?: string): string {
  const home = path.resolve(homeInput || process.env.HOME || os.homedir());
  return path.join(home, '.codex', 'config.toml');
}

export async function listCodexMcpServers(opts: CodexMcpManagerOptions = {}) {
  const configPath = resolveConfigPath(opts);
  const read = await readConfigText(configPath);
  if (!read.ok) {
    return {
      schema: CODEX_MCP_LIST_SCHEMA,
      ok: false,
      scope: 'global',
      source: 'config_toml_static',
      config_path: configPath,
      servers: [] as CodexMcpServerSummary[],
      blockers: [configReadBlocker(read.code)],
      warnings: [],
      read_error_code: read.code,
      read_error: read.error
    };
  }
  const text = read.text;
  const parsed = parseConfig(text);
  if (!parsed.ok) {
    return {
      schema: CODEX_MCP_LIST_SCHEMA,
      ok: false,
      scope: 'global',
      source: 'config_toml_static',
      config_path: configPath,
      servers: [] as CodexMcpServerSummary[],
      blockers: ['codex_mcp_config_toml_parse_failed'],
      warnings: [],
      parse_error: parsed.error
    };
  }
  const rawServers = isRecord(parsed.value.mcp_servers) ? parsed.value.mcp_servers : {};
  const servers = Object.entries(rawServers)
    .filter(([, value]) => isRecord(value))
    .map(([name, value]) => summarizeServer(name, value as Record<string, unknown>))
    .sort((left, right) => left.name.localeCompare(right.name));
  return {
    schema: CODEX_MCP_LIST_SCHEMA,
    ok: true,
    scope: 'global',
    source: 'config_toml_static',
    config_path: configPath,
    server_count: servers.length,
    enabled_count: servers.filter((server) => server.enabled).length,
    servers,
    blockers: [],
    warnings: ['changes_apply_to_new_codex_sessions']
  };
}

export async function addCodexMcpServer(input: unknown, opts: CodexMcpManagerOptions = {}) {
  const normalized = normalizeAddInput(input);
  if (!normalized.ok) return mutationFailure('add', null, opts, normalized.blockers);
  return mutateCodexMcpConfig('add', normalized.value.name, opts, (before, parsed) => {
    const servers = isRecord(parsed.mcp_servers) ? parsed.mcp_servers : {};
    if (Object.prototype.hasOwnProperty.call(servers, normalized.value.name)) {
      return { ok: false as const, blockers: ['codex_mcp_server_already_exists'] };
    }
    const newline = before.includes('\r\n') ? '\r\n' : '\n';
    const block = renderServerBlock(normalized.value).replace(/\n/g, newline);
    const separator = !before
      ? ''
      : before.endsWith(`${newline}${newline}`)
        ? ''
        : before.endsWith(newline)
          ? newline
          : `${newline}${newline}`;
    const next = `${before}${separator}${block}${newline}`;
    return { ok: true as const, next, enabled: true };
  });
}

export async function setCodexMcpServerEnabled(nameInput: unknown, enabled: boolean, opts: CodexMcpManagerOptions = {}) {
  const name = normalizeServerName(nameInput);
  if (!name) return mutationFailure(enabled ? 'enable' : 'disable', null, opts, ['invalid_codex_mcp_server_name']);
  return mutateCodexMcpConfig(enabled ? 'enable' : 'disable', name, opts, (before, parsed) => {
    const servers = isRecord(parsed.mcp_servers) ? parsed.mcp_servers : {};
    if (!Object.prototype.hasOwnProperty.call(servers, name)) {
      return { ok: false as const, blockers: ['codex_mcp_server_not_found'] };
    }
    const next = upsertServerEnabled(before, name, enabled);
    if (next === null) return { ok: false as const, blockers: ['codex_mcp_server_table_not_found'] };
    return { ok: true as const, next, enabled };
  });
}

export async function removeCodexMcpServer(nameInput: unknown, opts: CodexMcpManagerOptions = {}) {
  const name = normalizeServerName(nameInput);
  if (!name) return mutationFailure('remove', null, opts, ['invalid_codex_mcp_server_name']);
  return mutateCodexMcpConfig('remove', name, opts, (before, parsed) => {
    const servers = isRecord(parsed.mcp_servers) ? parsed.mcp_servers : {};
    if (!Object.prototype.hasOwnProperty.call(servers, name)) {
      return { ok: false as const, blockers: ['codex_mcp_server_not_found'] };
    }
    const next = removeServerTables(before, name);
    if (next === null) return { ok: false as const, blockers: ['codex_mcp_server_table_not_found'] };
    return { ok: true as const, next, enabled: null };
  });
}

async function mutateCodexMcpConfig(
  action: 'add' | 'enable' | 'disable' | 'remove',
  name: string,
  opts: CodexMcpManagerOptions,
  mutate: (before: string, parsed: Record<string, any>) =>
    | { ok: true; next: string; enabled: boolean | null }
    | { ok: false; blockers: string[] }
) {
  const configPath = resolveConfigPath(opts);
  const root = path.resolve(opts.root || opts.home || path.dirname(path.dirname(configPath)));
  const lockPath = `${configPath}.sks-mcp.lock`;
  try {
    return await withFileLock({ lockPath, timeoutMs: 10_000, staleMs: 60_000 }, async () => {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const read = await readConfigText(configPath);
        if (!read.ok) {
          return mutationFailure(action, name, opts, [configReadBlocker(read.code)], read.error);
        }
        const before = read.text;
        const parsed = parseConfig(before);
        if (!parsed.ok) {
          return mutationFailure(action, name, opts, ['codex_mcp_config_toml_parse_failed'], parsed.error);
        }
        const change = mutate(before, parsed.value);
        if (!change.ok) return mutationFailure(action, name, opts, change.blockers);
        const write = await writeCodexConfigGuarded({
          root,
          configPath,
          before,
          cause: `menubar-mcp-${action}`,
          backupTag: `menubar-mcp-${action}`,
          ownershipVerified: true,
          verifyUnchangedBeforeWrite: true,
          expectedBeforeExists: read.exists,
          preserveFastUiKeys: false,
          preserveTextFormatting: true,
          mutate: () => change.next
        });
        if (!write.ok) {
          if (write.status === 'concurrent_change_detected' && attempt < 3) continue;
          return mutationFailure(action, name, opts, [
            write.status === 'concurrent_change_detected'
              ? 'codex_mcp_config_busy'
              : `codex_mcp_config_write_${write.status}`
          ], undefined, write);
        }
        const list = await listCodexMcpServers({ ...opts, configPath });
        const applied = list.ok === true && mutationApplied(action, name, change.enabled, list.servers);
        if (!applied && attempt < 3) continue;
        return {
          schema: CODEX_MCP_MUTATION_SCHEMA,
          ok: applied,
          action,
          name,
          enabled: change.enabled,
          scope: 'global',
          config_path: configPath,
          changed: write.changed,
          backup_path: write.backup_path,
          restart_required: applied,
          servers: list.servers,
          blockers: applied ? [] : list.ok === true ? ['codex_mcp_config_changed_after_write'] : list.blockers,
          warnings: ['changes_apply_to_new_codex_sessions'],
          attempts: attempt,
          write
        };
      }
      return mutationFailure(action, name, opts, ['codex_mcp_config_busy']);
    });
  } catch (error) {
    return mutationFailure(action, name, opts, [messageOf(error).startsWith('file_lock_timeout:') ? 'codex_mcp_config_busy' : 'codex_mcp_config_mutation_failed'], messageOf(error));
  }
}

function mutationFailure(
  action: string,
  name: string | null,
  opts: CodexMcpManagerOptions,
  blockers: string[],
  error?: string,
  write?: unknown
) {
  return {
    schema: CODEX_MCP_MUTATION_SCHEMA,
    ok: false,
    action,
    name,
    enabled: null,
    scope: 'global',
    config_path: resolveConfigPath(opts),
    changed: false,
    restart_required: false,
    servers: [] as CodexMcpServerSummary[],
    blockers,
    warnings: [],
    ...(error ? { error } : {}),
    ...(write ? { write } : {})
  };
}

function normalizeAddInput(input: unknown): { ok: true; value: CodexMcpAddInput } | { ok: false; blockers: string[] } {
  if (!isRecord(input)) return { ok: false, blockers: ['codex_mcp_add_payload_required'] };
  const name = normalizeServerName(input.name);
  const transport = String(input.transport || '').trim().toLowerCase();
  const blockers: string[] = [];
  if (!name) blockers.push('invalid_codex_mcp_server_name');
  if (transport !== 'stdio' && transport !== 'url') blockers.push('invalid_codex_mcp_transport');
  const value: CodexMcpAddInput = {
    name: name || '',
    transport: transport === 'url' ? 'url' : 'stdio'
  };
  const startupTimeout = optionalPositiveNumber(input.startup_timeout_sec, 'invalid_codex_mcp_startup_timeout', blockers);
  const toolTimeout = optionalPositiveNumber(input.tool_timeout_sec, 'invalid_codex_mcp_tool_timeout', blockers);
  if (startupTimeout !== null) value.startup_timeout_sec = startupTimeout;
  if (toolTimeout !== null) value.tool_timeout_sec = toolTimeout;

  if (transport === 'url') {
    const url = normalizeHttpUrl(input.url);
    if (!url) blockers.push('invalid_codex_mcp_url');
    else value.url = url;
    const bearer = normalizeEnvKey(input.bearer_token_env_var, true);
    if (input.bearer_token_env_var && !bearer) blockers.push('invalid_codex_mcp_bearer_token_env_var');
    if (bearer) value.bearer_token_env_var = bearer;
  }

  if (transport === 'stdio') {
    const command = normalizeSingleLine(input.command, 1024);
    if (!command) blockers.push('invalid_codex_mcp_command');
    else value.command = command;
    const args = Array.isArray(input.args) ? input.args.map((arg) => normalizeSingleLine(arg, 4096)).filter((arg): arg is string => arg !== null) : [];
    if (Array.isArray(input.args) && args.length !== input.args.length) blockers.push('invalid_codex_mcp_argument');
    if (args.length > 100) blockers.push('too_many_codex_mcp_arguments');
    if (args.length) value.args = args;
    if (input.env !== undefined) {
      if (!isRecord(input.env)) blockers.push('invalid_codex_mcp_env');
      else {
        const env: Record<string, string> = {};
        for (const [key, rawValue] of Object.entries(input.env)) {
          const normalizedKey = normalizeEnvKey(key, false);
          const normalizedValue = normalizeSingleLine(rawValue, 16 * 1024, true);
          if (!normalizedKey || normalizedValue === null) blockers.push('invalid_codex_mcp_env');
          else env[normalizedKey] = normalizedValue;
        }
        if (Object.keys(env).length > 64) blockers.push('too_many_codex_mcp_env_vars');
        if (Object.keys(env).length) value.env = env;
      }
    }
  }

  return blockers.length ? { ok: false, blockers: [...new Set(blockers)] } : { ok: true, value };
}

function renderServerBlock(input: CodexMcpAddInput): string {
  const lines = [
    `[mcp_servers.${tomlKey(input.name)}]`,
    'enabled = true'
  ];
  if (input.transport === 'url') {
    lines.push(`url = ${tomlString(input.url || '')}`);
    if (input.bearer_token_env_var) lines.push(`bearer_token_env_var = ${tomlString(input.bearer_token_env_var)}`);
  } else {
    lines.push(`command = ${tomlString(input.command || '')}`);
    if (input.args?.length) lines.push(`args = [${input.args.map(tomlString).join(', ')}]`);
    if (input.env && Object.keys(input.env).length) {
      const entries = Object.entries(input.env).sort(([left], [right]) => left.localeCompare(right));
      lines.push(`env = { ${entries.map(([key, value]) => `${tomlKey(key)} = ${tomlString(value)}`).join(', ')} }`);
    }
  }
  if (input.startup_timeout_sec !== undefined) lines.push(`startup_timeout_sec = ${input.startup_timeout_sec}`);
  if (input.tool_timeout_sec !== undefined) lines.push(`tool_timeout_sec = ${input.tool_timeout_sec}`);
  return lines.join('\n');
}

function summarizeServer(name: string, value: Record<string, unknown>): CodexMcpServerSummary {
  const command = typeof value.command === 'string' ? displayCommand(value.command) : null;
  const rawUrl = typeof value.url === 'string' ? value.url : null;
  const args = Array.isArray(value.args) ? value.args : [];
  const transport: CodexMcpServerSummary['transport'] = rawUrl ? 'url' : command ? 'stdio' : 'unknown';
  const url = rawUrl ? redactUrl(rawUrl) : null;
  const envKeys = isRecord(value.env) ? Object.keys(value.env).sort() : [];
  const summary = transport === 'url'
    ? `Remote · ${url || 'URL configured'}`
    : transport === 'stdio'
      ? `Local · ${command}${args.length ? ` · ${args.length} arg${args.length === 1 ? '' : 's'}` : ''}`
      : 'Configuration requires review';
  return {
    name,
    enabled: value.enabled !== false,
    transport,
    command,
    argument_count: args.length,
    env_keys: envKeys,
    url,
    bearer_token_env_var: typeof value.bearer_token_env_var === 'string' ? value.bearer_token_env_var : null,
    startup_timeout_sec: finiteNumberOrNull(value.startup_timeout_sec),
    tool_timeout_sec: finiteNumberOrNull(value.tool_timeout_sec),
    summary
  };
}

function upsertServerEnabled(text: string, name: string, enabled: boolean): string | null {
  const source = String(text || '');
  const span = tableSpans(source).find((candidate) => !candidate.array && isServerRoot(candidate.path, name));
  if (!span) return null;
  let state: TomlMultilineState = 'normal';
  for (const line of sourceLines(source, span.headerEnd, span.end)) {
    if (state === 'normal') {
      const match = line.content.match(/^([ \t]*enabled[ \t]*=[ \t]*)(true|false)([ \t]*(?:#.*)?)$/);
      if (match?.[1] !== undefined && match[2] !== undefined) {
        const valueStart = line.start + match[1].length;
        const valueEnd = valueStart + match[2].length;
        return `${source.slice(0, valueStart)}${enabled ? 'true' : 'false'}${source.slice(valueEnd)}`;
      }
    }
    state = advanceTomlMultilineState(line.content, state);
  }
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const needsLeadingNewline = span.headerEnd > 0 && !/[\r\n]/.test(source[span.headerEnd - 1] || '');
  const insertion = `${needsLeadingNewline ? newline : ''}enabled = ${enabled ? 'true' : 'false'}${newline}`;
  return `${source.slice(0, span.headerEnd)}${insertion}${source.slice(span.headerEnd)}`;
}

function removeServerTables(text: string, name: string): string | null {
  const source = String(text || '');
  const spans = tableSpans(source).filter((span) => isServerPath(span.path, name));
  if (!spans.length) return null;
  let next = source;
  for (const span of [...spans].sort((left, right) => right.start - left.start)) {
    const removalEnd = tableRemovalEnd(source, span);
    next = `${next.slice(0, span.start)}${next.slice(removalEnd)}`;
  }
  return next;
}

function tableRemovalEnd(source: string, span: TableSpan): number {
  let removalEnd = span.end;
  const lines = sourceLines(source, span.headerEnd, span.end);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line) continue;
    const trimmed = line.content.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      removalEnd = line.start;
      continue;
    }
    break;
  }
  return removalEnd;
}

function tableSpans(text: string): TableSpan[] {
  const source = String(text || '');
  const headers: Array<{ start: number; headerEnd: number; path: string[]; array: boolean }> = [];
  let state: TomlMultilineState = 'normal';
  for (const line of sourceLines(source)) {
    if (state === 'normal') {
      const header = parseTableHeader(line.content);
      if (header) headers.push({ start: line.start, headerEnd: line.end, path: header.path, array: header.array });
    }
    state = advanceTomlMultilineState(line.content, state);
  }
  return headers.map((header, index) => ({
    start: header.start,
    headerEnd: header.headerEnd,
    end: headers[index + 1]?.start ?? source.length,
    path: header.path,
    array: header.array
  }));
}

function sourceLines(text: string, start = 0, end = text.length): SourceLine[] {
  const lines: SourceLine[] = [];
  let cursor = Math.max(0, start);
  const limit = Math.min(text.length, Math.max(cursor, end));
  while (cursor < limit) {
    const newlineIndex = text.indexOf('\n', cursor);
    const lineEnd = newlineIndex === -1 || newlineIndex >= limit ? limit : newlineIndex + 1;
    let contentEnd = newlineIndex === -1 || newlineIndex >= limit ? lineEnd : newlineIndex;
    if (contentEnd > cursor && text[contentEnd - 1] === '\r') contentEnd -= 1;
    lines.push({ start: cursor, end: lineEnd, content: text.slice(cursor, contentEnd) });
    cursor = lineEnd;
  }
  return lines;
}

function advanceTomlMultilineState(line: string, initial: TomlMultilineState): TomlMultilineState {
  let state = initial;
  let quote: 'basic' | 'literal' | null = null;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    if (state === 'multiline-basic') {
      if (line.startsWith('"""', index) && !isEscapedAt(line, index)) {
        state = 'normal';
        index += 2;
      }
      continue;
    }
    if (state === 'multiline-literal') {
      if (line.startsWith("'''", index)) {
        state = 'normal';
        index += 2;
      }
      continue;
    }
    const char = line[index] || '';
    if (quote === 'basic') {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') quote = null;
      continue;
    }
    if (quote === 'literal') {
      if (char === "'") quote = null;
      continue;
    }
    if (char === '#') break;
    if (line.startsWith('"""', index)) {
      state = 'multiline-basic';
      index += 2;
      continue;
    }
    if (line.startsWith("'''", index)) {
      state = 'multiline-literal';
      index += 2;
      continue;
    }
    if (char === '"') quote = 'basic';
    else if (char === "'") quote = 'literal';
  }
  return state;
}

function isEscapedAt(value: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) slashes += 1;
  return slashes % 2 === 1;
}

function parseTableHeader(line: string): { path: string[]; array: boolean } | null {
  const arrayMatch = line.match(/^\s*\[\[([^\[\]]+)\]\]\s*(?:#.*)?$/);
  const tableMatch = arrayMatch ? null : line.match(/^\s*\[([^\[\]]+)\]\s*(?:#.*)?$/);
  const source = arrayMatch?.[1] || tableMatch?.[1];
  if (!source) return null;
  const segments: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (const char of source) {
    if (quote) {
      current += char;
      if (quote === '"' && escaped) {
        escaped = false;
        continue;
      }
      if (quote === '"' && char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === '.') {
      const decoded = decodeTomlKey(current);
      if (decoded === null) return null;
      segments.push(decoded);
      current = '';
      continue;
    }
    current += char;
  }
  if (quote) return null;
  const decoded = decodeTomlKey(current);
  if (decoded === null) return null;
  segments.push(decoded);
  return { path: segments, array: Boolean(arrayMatch) };
}

function decodeTomlKey(value: string): string | null {
  const token = value.trim();
  if (!token) return null;
  if (token.startsWith('"') && token.endsWith('"')) {
    try {
      return JSON.parse(token);
    } catch {
      return null;
    }
  }
  if (token.startsWith("'") && token.endsWith("'")) return token.slice(1, -1);
  return /^[A-Za-z0-9_-]+$/.test(token) ? token : null;
}

function isServerRoot(parts: string[], name: string): boolean {
  return parts.length === 2 && parts[0] === 'mcp_servers' && parts[1] === name;
}

function isServerPath(parts: string[], name: string): boolean {
  return parts.length >= 2 && parts[0] === 'mcp_servers' && parts[1] === name;
}

function normalizeServerName(value: unknown): string | null {
  const text = normalizeSingleLine(value, 64);
  return text && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(text) ? text : null;
}

function normalizeEnvKey(value: unknown, optional: boolean): string | null {
  const text = normalizeSingleLine(value, 128);
  if (!text) return optional ? null : null;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text) ? text : null;
}

function normalizeSingleLine(value: unknown, maxLength: number, allowEmpty = false): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if ((!allowEmpty && !text) || text.length > maxLength || /[\r\n\0]/.test(text)) return null;
  return text;
}

function normalizeHttpUrl(value: unknown): string | null {
  const text = normalizeSingleLine(value, 4096);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function optionalPositiveNumber(value: unknown, blocker: string, blockers: string[]): number | null {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 3600) {
    blockers.push(blocker);
    return null;
  }
  return number;
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin === 'null') return '[configured URL]';
    return url.pathname && url.pathname !== '/' ? `${url.origin}/…` : url.origin;
  } catch {
    return '[configured URL]';
  }
}

function displayCommand(value: string): string {
  const text = String(value || '').trim();
  const base = path.basename(text);
  if (!base || base.length > 128 || !/^[A-Za-z0-9._+-]+$/.test(base)) return '[configured command]';
  return base;
}

function tomlString(value: string): string {
  return JSON.stringify(String(value));
}

function tomlKey(value: string): string {
  return tomlString(value);
}

function finiteNumberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseConfig(text: string): { ok: true; value: Record<string, any> } | { ok: false; error: string } {
  try {
    return { ok: true, value: parseCodexConfigToml(text) };
  } catch (error) {
    return { ok: false, error: safeTomlParseError(error) };
  }
}

function safeTomlParseError(error: unknown): string {
  const message = messageOf(error);
  const lineColumn = message.match(/\bline\s+(\d+)(?:\s*,?\s*column\s+(\d+))?/i);
  if (lineColumn?.[1]) return `invalid_toml_at_line_${lineColumn[1]}${lineColumn[2] ? `_column_${lineColumn[2]}` : ''}`;
  const offset = message.match(/\bat\s+(\d+):(\d+)\b/);
  if (offset?.[1] && offset[2]) return `invalid_toml_at_line_${offset[1]}_column_${offset[2]}`;
  return 'invalid_toml';
}

async function readConfigText(configPath: string): Promise<
  | { ok: true; text: string; exists: boolean }
  | { ok: false; code: string; error: string }
> {
  let stat;
  try {
    stat = await fs.lstat(configPath);
  } catch (error) {
    const code = errorCode(error);
    if (code === 'ENOENT') return { ok: true, text: '', exists: false };
    return { ok: false, code: code || 'UNKNOWN', error: messageOf(error) };
  }
  if (stat.isSymbolicLink()) {
    return { ok: false, code: 'SYMLINK', error: `Refusing to replace symbolic-link Codex config: ${configPath}` };
  }
  if (!stat.isFile()) {
    return { ok: false, code: 'NON_REGULAR', error: `Codex config is not a regular file: ${configPath}` };
  }
  try {
    return { ok: true, text: await readText(configPath), exists: true };
  } catch (error) {
    return { ok: false, code: errorCode(error) || 'UNKNOWN', error: messageOf(error) };
  }
}

function mutationApplied(
  action: 'add' | 'enable' | 'disable' | 'remove',
  name: string,
  enabled: boolean | null,
  servers: CodexMcpServerSummary[]
): boolean {
  const server = servers.find((candidate) => candidate.name === name);
  if (action === 'remove') return !server;
  if (!server) return false;
  if (action === 'enable' || action === 'disable') return server.enabled === enabled;
  return action === 'add';
}

function configReadBlocker(code: string): string {
  if (code === 'SYMLINK') return 'codex_mcp_config_symlink_unsupported';
  if (code === 'NON_REGULAR') return 'codex_mcp_config_not_regular_file';
  return 'codex_mcp_config_read_failed';
}

function resolveConfigPath(opts: CodexMcpManagerOptions): string {
  return path.resolve(opts.configPath || codexMcpConfigPath(opts.home));
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
}
