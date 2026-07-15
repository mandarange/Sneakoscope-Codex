import path from 'node:path';
import { exists, readText, sha256 } from '../../fsx.js';
import { redactSupabaseUrl } from './runtime-profile.js';

export interface MadSksSqlPlaneTarget {
  schema: 'sks.mad-sks-sql-plane-target.v1';
  project_ref: string | null;
  project_ref_hash: string | null;
  mcp_url: string | null;
  mcp_url_hash: string | null;
  mcp_url_redacted: string | null;
  mcp_url_source: 'default_generated' | 'explicit_or_environment';
  target_environment: 'local' | 'branch' | 'preview' | 'production';
  allowed_schemas: string[];
  source: string;
  blockers: string[];
  candidates: string[];
}

export async function resolveMadSksSqlPlaneTarget(root: string, input: { args?: string[]; projectRef?: string | null; target?: string | null; allowedSchemas?: string[] } = {}): Promise<MadSksSqlPlaneTarget> {
  const args = input.args || [];
  const explicit = input.projectRef || readOption(args, '--project-ref', '') || process.env.SKS_MAD_SKS_SQL_PLANE_PROJECT_REF || process.env.SKS_MAD_SKS_SQL_PLANE_E2E_PROJECT_REF || '';
  const candidates = explicit ? [explicit] : await projectRefCandidates(root);
  const projectRef = explicit || (candidates.length === 1 ? candidates[0] || '' : '');
  const explicitMcpUrl = readOption(args, '--mcp-url', '') || process.env.SKS_MAD_SKS_SQL_PLANE_MCP_URL || process.env.SKS_MAD_SKS_SQL_PLANE_SUPABASE_MCP_URL || '';
  const normalizedMcp = normalizeExplicitMcpUrl(explicitMcpUrl, projectRef || null);
  const target = normalizeTarget(input.target || readOption(args, '--target', '') || process.env.SKS_MAD_SKS_SQL_PLANE_TARGET || process.env.SKS_MAD_SKS_SQL_PLANE_E2E_TARGET || 'production');
  const allowedSchemas = input.allowedSchemas?.length
    ? input.allowedSchemas
    : splitCsv(readOption(args, '--schema', readOption(args, '--schemas', process.env.SKS_MAD_SKS_SQL_PLANE_SCHEMAS || 'public')));
  const blockers = [];
  if (!projectRef) blockers.push(candidates.length > 1 ? 'mad_sks_sql_plane_project_ref_ambiguous' : 'mad_sks_sql_plane_project_ref_missing');
  if (normalizedMcp.blocker) blockers.push(normalizedMcp.blocker);
  return {
    schema: 'sks.mad-sks-sql-plane-target.v1',
    project_ref: projectRef || null,
    project_ref_hash: projectRef ? sha256(projectRef).slice(0, 16) : null,
    mcp_url: normalizedMcp.url,
    mcp_url_hash: normalizedMcp.url ? sha256(normalizedMcp.url).slice(0, 16) : null,
    mcp_url_redacted: normalizedMcp.url ? redactSupabaseUrl(normalizedMcp.url) : null,
    mcp_url_source: normalizedMcp.url ? 'explicit_or_environment' : 'default_generated',
    target_environment: target,
    allowed_schemas: allowedSchemas.length ? allowedSchemas : ['public'],
    source: explicit ? 'explicit_or_environment' : candidates.length === 1 ? 'managed_config_single_candidate' : 'unresolved',
    blockers,
    candidates: candidates.map((candidate) => `${sha256(candidate).slice(0, 8)}:${candidate.slice(0, 2)}...`)
  };
}

function normalizeExplicitMcpUrl(value: string, projectRef: string | null): { url: string | null; blocker: string | null } {
  if (!value) return { url: null, blocker: null };
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { url: null, blocker: 'mad_sks_sql_plane_mcp_url_invalid' };
  }
  const isSupabaseRemote = parsed.protocol === 'https:' && parsed.hostname === 'mcp.supabase.com' && parsed.pathname === '/mcp';
  const isLocalMcp = parsed.protocol === 'http:' && /^localhost$|^127\.0\.0\.1$/.test(parsed.hostname) && parsed.pathname.endsWith('/mcp');
  if (!isSupabaseRemote && !isLocalMcp) return { url: null, blocker: 'mad_sks_sql_plane_mcp_url_untrusted_host' };
  if (parsed.searchParams.get('read_only') === 'true') return { url: null, blocker: 'mad_sks_sql_plane_mcp_url_read_only_conflict' };
  if (projectRef && !parsed.searchParams.get('project_ref')) parsed.searchParams.set('project_ref', projectRef);
  parsed.searchParams.set('features', 'database');
  parsed.searchParams.delete('read_only');
  return { url: parsed.toString(), blocker: null };
}

export async function projectRootHash(root: string): Promise<string> {
  return sha256(path.resolve(root)).slice(0, 24);
}

async function projectRefCandidates(root: string): Promise<string[]> {
  const files = ['.codex/config.toml', '.mcp.json', 'mcp.json', '.cursor/mcp.json', '.vscode/mcp.json'];
  const out = new Set<string>();
  for (const rel of files) {
    const file = path.join(root, rel);
    if (!(await exists(file))) continue;
    const text = await readText(file, '');
    for (const match of String(text).matchAll(/project_ref=([a-z0-9_-]+)/gi)) out.add(match[1] || '');
    for (const match of String(text).matchAll(/project_ref["']?\s*[:=]\s*["']([a-z0-9_-]+)["']/gi)) out.add(match[1] || '');
  }
  return [...out].filter(Boolean);
}

function normalizeTarget(value: string): MadSksSqlPlaneTarget['target_environment'] {
  const text = String(value || '').toLowerCase();
  if (text === 'local') return 'local';
  if (text === 'branch') return 'branch';
  if (text === 'preview') return 'preview';
  return 'production';
}

function splitCsv(value: string): string[] {
  return String(value || '').split(',').map((entry) => entry.trim()).filter(Boolean);
}

function readOption(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !String(args[index + 1]).startsWith('--')) return String(args[index + 1]);
  const prefixed = args.find((arg) => String(arg).startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : fallback;
}
