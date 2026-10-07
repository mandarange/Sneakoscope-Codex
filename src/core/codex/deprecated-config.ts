import { isDeepStrictEqual } from 'node:util';
import { parse } from 'smol-toml';

type Config = Record<string, any>;
type Edit = { path: string[]; value?: string | string[]; remove?: true };

export interface DeprecatedCodexConfigRepair {
  text: string;
  removed: string[];
  migrated: string[];
  blockers: string[];
  warnings: string[];
}

/** Known ignored keys only. Never infer a network permission from an ignored key. */
export function repairDeprecatedCodexConfigText(
  text: string,
  options: { enforceSupabaseReadOnly?: boolean } = {}
): DeprecatedCodexConfigRepair {
  const result: DeprecatedCodexConfigRepair = { text, removed: [], migrated: [], blockers: [], warnings: [] };
  let expected: Config;
  try { expected = parse(text); } catch { return { ...result, blockers: ['toml_parse_failed'] }; }
  const edits: Edit[] = [];
  const remove = (owner: Config, key: string, prefix: string[]) => {
    if (!Object.hasOwn(owner, key)) return;
    const path = [...prefix, key];
    delete owner[key];
    edits.push({ path, remove: true });
    result.removed.push(path.join('.'));
  };
  const scopes: Array<{ config: Config; prefix: string[] }> = [{ config: expected, prefix: [] }];
  for (const [name, config] of Object.entries(expected.profiles || {})) {
    if (isTable(config)) scopes.push({ config, prefix: ['profiles', name] });
  }
  for (const { config, prefix } of scopes) {
    remove(config, 'network_access', prefix);
    const guardian = config.features?.guardianv2;
    if (isTable(guardian)) remove(guardian, 'thread_context', [...prefix, 'features', 'guardianv2']);
    const server = config.mcp_servers?.supabase;
    if (!isTable(server)) continue;
    const serverPath = [...prefix, 'mcp_servers', 'supabase'];
    const hadIgnoredReadOnly = Object.hasOwn(server, 'read_only');
    remove(server, 'read_only', serverPath);
    if ((!hadIgnoredReadOnly && !options.enforceSupabaseReadOnly) || server.enabled === false || server.disabled === true) continue;
    if (typeof server.url === 'string' && !server.command) {
      const url = hostedSupabaseUrl(server.url);
      if (!url) {
        result.blockers.push('supabase_mcp_read_only_transport_unverified');
        continue;
      }
      if (!url.searchParams.get('project_ref')) result.warnings.push('supabase_mcp_project_scope_missing');
      if (url.searchParams.get('read_only') !== 'true') {
        url.searchParams.set('read_only', 'true');
        server.url = url.toString();
        edits.push({ path: [...serverPath, 'url'], value: server.url });
        result.migrated.push(`${serverPath.join('.')}.url:read_only`);
      }
    } else if (isSupabaseStdio(server)) {
      if (!server.args.includes('--read-only')) {
        server.args = [...server.args, '--read-only'];
        edits.push({ path: [...serverPath, 'args'], value: server.args });
        result.migrated.push(`${serverPath.join('.')}.args:--read-only`);
      }
    } else {
      result.blockers.push('supabase_mcp_read_only_transport_unverified');
    }
  }
  if (result.blockers.length || !edits.length) return result;
  const pending = new Map(edits.map(edit => [JSON.stringify(edit.path), edit]));
  let table: string[] = [];
  const output: string[] = [];
  for (const statement of tomlStatements(text)) {
    const trimmed = statement.trim();
    if (!trimmed || trimmed.startsWith('#')) { output.push(statement); continue; }
    if (trimmed.startsWith('[')) {
      table = markerPath(`${statement}\n__sks_key_probe__ = true`);
      output.push(statement);
      continue;
    }
    const equals = assignmentEquals(statement);
    if (equals < 0) { output.push(statement); continue; }
    const keys = markerPath(`${statement.slice(0, equals)} = { __sks_key_probe__ = true }`);
    const editKey = JSON.stringify([...table, ...keys]);
    const edit = pending.get(editKey);
    if (!edit) { output.push(statement); continue; }
    pending.delete(editKey);
    // Comments inside a replaced array remain as comments before its new value.
    const comments = outsideStringComments(statement.slice(equals + 1));
    if (comments.length) output.push(comments.map(comment => `${comment}\n`).join(''));
    if (!edit.remove) {
      const ending = statement.endsWith('\r\n') ? '\r\n' : statement.endsWith('\n') ? '\n' : '';
      output.push(`${statement.slice(0, equals + 1)} ${JSON.stringify(edit.value)}${ending}`);
    }
  }
  const next = output.join('');
  // Inline-table layouts we cannot edit precisely are preserved, never flattened
  // or partially rewritten. This also catches lookalike keys inside strings.
  try {
    const observed = parse(next);
    // Deleting a dotted assignment can remove its implicit empty parent tables.
    for (const edit of edits.filter(edit => edit.remove)) {
      pruneEmptyParents(expected, edit.path.slice(0, -1));
      pruneEmptyParents(observed, edit.path.slice(0, -1));
    }
    if (pending.size || !isDeepStrictEqual(observed, expected)) throw new Error('unmatched');
  } catch {
    return { ...result, text, blockers: ['deprecated_config_layout_requires_manual_repair'] };
  }
  return { ...result, text: next };
}

function pruneEmptyParents(config: Config, keys: string[]): void {
  const [key, ...rest] = keys;
  if (!key || !isTable(config[key])) return;
  pruneEmptyParents(config[key], rest);
  if (!Object.keys(config[key]).length) delete config[key];
}

export function supabaseMcpIsReadOnly(server: unknown): boolean {
  if (!isTable(server)) return false;
  if (typeof server.url === 'string' && !server.command) return hostedSupabaseUrl(server.url)?.searchParams.get('read_only') === 'true';
  return isSupabaseStdio(server) && server.args.includes('--read-only');
}

function hostedSupabaseUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'mcp.supabase.com'
      && url.pathname === '/mcp' && !url.username && !url.password && !url.port ? url : null;
  } catch { return null; }
}

function isSupabaseStdio(server: Config): boolean {
  return typeof server.command === 'string' && !server.url && Array.isArray(server.args)
    && server.args.every((arg: unknown) => typeof arg === 'string')
    && server.args.some((arg: string) => /^@supabase\/mcp-server-supabase(?:@[^\s]+)?$/.test(arg));
}

function isTable(value: unknown): value is Config {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function markerPath(source: string): string[] {
  const walk = (value: any): string[] | null => {
    if (!isTable(value)) return null;
    if (value.__sks_key_probe__ === true) return [];
    for (const [key, child] of Object.entries(value)) {
      const found = walk(child);
      if (found) return [key, ...found];
    }
    return null;
  };
  try { return walk(parse(source)) || []; } catch { return []; }
}

/** Split only at newlines outside values; quoted pseudo-tables stay opaque. */
function tomlStatements(text: string): string[] {
  const statements: string[] = [];
  let start = 0, depth = 0;
  let quote = '', triple = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (quote === '"' && ch === '\\') { i++; continue; }
      if (ch === quote && (!triple || text.slice(i, i + 3) === quote.repeat(3))) {
        if (triple) i += 2;
        quote = ''; triple = false;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch; triple = text.slice(i, i + 3) === ch.repeat(3);
      if (triple) i += 2;
    } else if (ch === '#') {
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end - 1;
    } else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') depth--;
    else if (ch === '\n' && depth === 0) { statements.push(text.slice(start, i + 1)); start = i + 1; }
  }
  if (start < text.length) statements.push(text.slice(start));
  return statements;
}

function assignmentEquals(statement: string): number {
  let quote = '';
  for (let i = 0; i < statement.length; i++) {
    const ch = statement[i];
    if (quote) {
      if (quote === '"' && ch === '\\') { i++; continue; }
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '=') return i;
    else if (ch === '#') return -1;
  }
  return -1;
}

function outsideStringComments(statement: string): string[] {
  const comments: string[] = [];
  let quote = '';
  for (let i = 0; i < statement.length; i++) {
    const ch = statement[i];
    if (quote) {
      if (quote === '"' && ch === '\\') { i++; continue; }
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '#') {
      const end = statement.indexOf('\n', i);
      comments.push(statement.slice(i, end < 0 ? undefined : end).trimEnd());
      i = end < 0 ? statement.length : end;
    }
  }
  return comments;
}
