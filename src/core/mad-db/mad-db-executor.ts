import { performance } from 'node:perf_hooks';
import { nowIso, sha256 } from '../fsx.js';
import type { MadDbRuntimeProfile } from './mad-db-runtime-profile.js';

export interface MadDbToolInventory {
  schema: 'sks.mad-db-tool-inventory.v1';
  checked_at: string;
  ok: boolean;
  tool_names: string[];
  execute_sql_available: boolean;
  apply_migration_available: boolean;
  duration_ms: number;
  error_digest: string | null;
}

export interface MadDbToolResult {
  schema: 'sks.mad-db-tool-result.v1';
  ok: boolean;
  tool_name: string;
  result_digest: string | null;
  row_count: number | null;
  is_error: boolean;
  duration_ms: number;
}

export class MadDbMcpExecutor {
  private client: any = null;
  private transport: any = null;

  constructor(private readonly profile: MadDbRuntimeProfile, private readonly opts: { timeoutMs?: number } = {}) {}

  async connect(): Promise<void> {
    if (this.client) return;
    const { Client, StreamableHTTPClientTransport } = await loadMcpSdk();
    this.client = new Client({ name: 'sneakoscope-mad-db', version: '4.2.0' });
    const headers = authHeaders();
    const options = headers ? { requestInit: { headers } } : {};
    this.transport = new StreamableHTTPClientTransport(new URL(this.profile.server_url), options);
    await this.client.connect(this.transport);
  }

  async inventory(): Promise<MadDbToolInventory> {
    const started = performance.now();
    try {
      await this.connect();
      const result = await this.client!.listTools({}, { timeout: this.opts.timeoutMs || 10_000 });
      const names = (result.tools || []).map((tool: any) => String(tool?.name || '')).filter(Boolean).sort();
      return {
        schema: 'sks.mad-db-tool-inventory.v1',
        checked_at: nowIso(),
        ok: hasTool(names, 'execute_sql') && hasTool(names, 'apply_migration'),
        tool_names: names,
        execute_sql_available: hasTool(names, 'execute_sql'),
        apply_migration_available: hasTool(names, 'apply_migration'),
        duration_ms: Math.round(performance.now() - started),
        error_digest: null
      };
    } catch (err: unknown) {
      return {
        schema: 'sks.mad-db-tool-inventory.v1',
        checked_at: nowIso(),
        ok: false,
        tool_names: [],
        execute_sql_available: false,
        apply_migration_available: false,
        duration_ms: Math.round(performance.now() - started),
        error_digest: sha256(redactError(err)).slice(0, 32)
      };
    }
  }

  async executeSql(sql: string): Promise<MadDbToolResult> {
    return this.callToolWithFallback(['execute_sql', 'supabase.execute_sql'], [{ query: sql }, { sql }]);
  }

  async applyMigration(name: string, sql: string): Promise<MadDbToolResult> {
    return this.callToolWithFallback(['apply_migration', 'supabase.apply_migration'], [{ name, query: sql }, { name, sql }]);
  }

  async close(): Promise<void> {
    await this.transport?.terminateSession().catch(() => undefined);
    await this.client?.close().catch(() => undefined);
    this.client = null;
    this.transport = null;
  }

  private async callToolWithFallback(toolNames: string[], argsList: Array<Record<string, unknown>>): Promise<MadDbToolResult> {
    await this.connect();
    const inventory = await this.inventory();
    const tool = toolNames.find((name) => hasTool(inventory.tool_names, name)) || toolNames[0] || '';
    let lastError: unknown = null;
    for (const args of argsList) {
      const started = performance.now();
      try {
        const result = await this.client!.callTool(
          { name: tool, arguments: args },
          undefined,
          { timeout: this.opts.timeoutMs || 60_000, resetTimeoutOnProgress: true, maxTotalTimeout: 10 * 60_000 }
        );
        return {
          schema: 'sks.mad-db-tool-result.v1',
          ok: result.isError !== true,
          tool_name: tool,
          result_digest: sha256(JSON.stringify(redactToolResult(result))).slice(0, 32),
          row_count: extractRowCount(result),
          is_error: result.isError === true,
          duration_ms: Math.round(performance.now() - started)
        };
      } catch (err: unknown) {
        lastError = err;
      }
    }
    return {
      schema: 'sks.mad-db-tool-result.v1',
      ok: false,
      tool_name: tool,
      result_digest: sha256(redactError(lastError)).slice(0, 32),
      row_count: null,
      is_error: true,
      duration_ms: 0
    };
  }
}

async function loadMcpSdk(): Promise<{ Client: any; StreamableHTTPClientTransport: any }> {
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;
  const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
    dynamicImport('@modelcontextprotocol/sdk/client/index.js'),
    dynamicImport('@modelcontextprotocol/sdk/client/streamableHttp.js')
  ]);
  return { Client, StreamableHTTPClientTransport };
}

function hasTool(names: string[], name: string): boolean {
  return names.some((candidate) => candidate === name || candidate.endsWith(`.${name}`) || candidate.endsWith(`__${name}`));
}

function authHeaders(): HeadersInit | undefined {
  const token = process.env.SUPABASE_ACCESS_TOKEN || process.env.SKS_MAD_DB_SUPABASE_ACCESS_TOKEN || '';
  if (!token) return undefined;
  return { Authorization: `Bearer ${token}` };
}

function redactError(err: unknown): string {
  const text = err instanceof Error ? `${err.name}:${err.message}` : String(err);
  return text.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1<redacted>').replace(/(token|password|secret|apikey)=([^&\s]+)/gi, '$1=<redacted>');
}

function redactToolResult(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return value.replace(/(token|password|secret|apikey)["'=:\s]+[A-Za-z0-9._~+/=-]+/gi, '$1=<redacted>');
  if (Array.isArray(value)) return value.map(redactToolResult);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (/token|password|secret|apikey|service_role/i.test(key)) out[key] = '<redacted>';
      else if (/rows|data|records/i.test(key) && Array.isArray(entry)) out[key] = `<redacted:${entry.length}:rows>`;
      else out[key] = redactToolResult(entry);
    }
    return out;
  }
  return value;
}

function extractRowCount(value: any): number | null {
  const candidates = [
    value?.row_count,
    value?.rowCount,
    value?.rows_affected,
    value?.structuredContent?.row_count,
    value?.structuredContent?.rowCount,
    value?.structuredContent?.rows_affected
  ];
  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
