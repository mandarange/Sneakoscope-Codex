import fs from 'node:fs/promises';
import path from 'node:path';
import { exists, nowIso, readText, sha256, writeJsonAtomic, writeTextAtomic } from '../fsx.js';
import { missionDir } from '../mission.js';

export interface MadDbRuntimeProfile {
  schema: 'sks.mad-db-runtime-profile.v1';
  mission_id: string;
  cycle_id: string;
  runtime_session_id: string;
  project_ref_hash: string;
  profile_path: string;
  profile_sha256: string;
  server_url_redacted: string;
  server_url: string;
  server_url_source: 'generated_project_ref' | 'explicit_mcp_url';
  features: ['database'];
  write_capable: true;
  normal_config_hash_before: string | null;
  created_at: string;
}

export interface ReadOnlyRestorationProof {
  schema: 'sks.mad-db-read-only-restoration.v1';
  checked_at: string;
  ok: boolean;
  normal_config_hash_before: string | null;
  normal_config_hash_after: string | null;
  persistent_supabase_read_only: boolean;
  runtime_profile_exists: boolean;
  blockers: string[];
}

export async function createMadDbRuntimeProfile(input: {
  root: string;
  missionId: string;
  cycleId: string;
  projectRef: string;
  runtimeSessionId: string;
  mcpUrl?: string | null;
}): Promise<MadDbRuntimeProfile> {
  const dir = path.join(missionDir(input.root, input.missionId), 'mad-db', 'runtime');
  await fs.mkdir(dir, { recursive: true });
  const url = madDbMcpUrl(input.projectRef, input.mcpUrl);
  const text = [
    '[mcp_servers.supabase_mad_db]',
    `url = "${url}"`,
    'enabled = true',
    ''
  ].join('\n');
  const profilePath = path.join(dir, 'codex-mad-db.config.toml');
  await writeTextAtomic(profilePath, text);
  const profileHash = sha256(text);
  const normalHash = await normalCodexConfigHash(input.root);
  const profile: MadDbRuntimeProfile = {
    schema: 'sks.mad-db-runtime-profile.v1',
    mission_id: input.missionId,
    cycle_id: input.cycleId,
    runtime_session_id: input.runtimeSessionId,
    project_ref_hash: sha256(input.projectRef).slice(0, 16),
    profile_path: path.relative(input.root, profilePath).split(path.sep).join('/'),
    profile_sha256: profileHash,
    server_url_redacted: redactSupabaseUrl(url),
    server_url: url,
    server_url_source: input.mcpUrl ? 'explicit_mcp_url' : 'generated_project_ref',
    features: ['database'],
    write_capable: true,
    normal_config_hash_before: normalHash,
    created_at: nowIso()
  };
  await writeJsonAtomic(path.join(dir, 'runtime-profile-manifest.json'), redactedRuntimeProfile(profile));
  return profile;
}

export async function closeMadDbRuntimeProfile(input: { root: string; missionId: string; profile?: MadDbRuntimeProfile | null; reason?: string }): Promise<ReadOnlyRestorationProof> {
  const profilePath = input.profile?.profile_path ? path.join(input.root, input.profile.profile_path) : path.join(missionDir(input.root, input.missionId), 'mad-db', 'runtime', 'codex-mad-db.config.toml');
  if (await exists(profilePath)) {
    const quarantine = `${profilePath}.closed`;
    /* intentional: best-effort rename-then-rm quarantine of the closed runtime profile; read-only restoration is verified separately below */
    await fs.rename(profilePath, quarantine).catch(async () => {
      await fs.rm(profilePath, { force: true }).catch(() => undefined);
    });
  }
  const proof = await verifyReadOnlyRestored(input.root, input.profile?.normal_config_hash_before || null, profilePath);
  await writeJsonAtomic(path.join(missionDir(input.root, input.missionId), 'mad-db', 'runtime', 'read-only-restoration.json'), {
    ...proof,
    close_reason: input.reason || 'cycle_finally'
  });
  return proof;
}

export async function verifyReadOnlyRestored(root: string, normalConfigHashBefore: string | null, profilePath?: string): Promise<ReadOnlyRestorationProof> {
  const after = await normalCodexConfigHash(root);
  const text = await readText(path.join(root, '.codex', 'config.toml'), '');
  const persistentSupabaseReadOnly = persistentSupabaseConfigReadOnly(text);
  const runtimeExists = profilePath ? await exists(profilePath) : false;
  const blockers = [
    ...(normalConfigHashBefore && after && normalConfigHashBefore !== after ? ['normal_codex_config_hash_changed'] : []),
    ...(persistentSupabaseReadOnly ? [] : ['persistent_supabase_mcp_not_read_only']),
    ...(runtimeExists ? ['runtime_write_profile_still_exists'] : [])
  ];
  return {
    schema: 'sks.mad-db-read-only-restoration.v1',
    checked_at: nowIso(),
    ok: blockers.length === 0,
    normal_config_hash_before: normalConfigHashBefore,
    normal_config_hash_after: after,
    persistent_supabase_read_only: persistentSupabaseReadOnly,
    runtime_profile_exists: runtimeExists,
    blockers
  };
}

export function redactedRuntimeProfile(profile: MadDbRuntimeProfile): Omit<MadDbRuntimeProfile, 'server_url'> {
  const { server_url: _serverUrl, ...rest } = profile;
  return rest;
}

export function madDbMcpUrl(projectRef: string, explicitUrl?: string | null): string {
  if (explicitUrl) {
    const parsed = new URL(explicitUrl);
    if (projectRef && !parsed.searchParams.get('project_ref')) parsed.searchParams.set('project_ref', projectRef);
    parsed.searchParams.set('features', 'database');
    parsed.searchParams.delete('read_only');
    return parsed.toString();
  }
  const params = new URLSearchParams();
  params.set('project_ref', projectRef);
  params.set('features', 'database');
  return `https://mcp.supabase.com/mcp?${params.toString()}`;
}

export function redactSupabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const ref = parsed.searchParams.get('project_ref') || '';
    if (ref) parsed.searchParams.set('project_ref', `<hash:${sha256(ref).slice(0, 12)}>`);
    for (const key of ['access_token', 'token', 'apikey', 'key', 'password']) {
      if (parsed.searchParams.has(key)) parsed.searchParams.set(key, '<redacted>');
    }
    return parsed.toString();
  } catch {
    return '<redacted-invalid-url>';
  }
}

async function normalCodexConfigHash(root: string): Promise<string | null> {
  const file = path.join(root, '.codex', 'config.toml');
  if (!(await exists(file))) return null;
  return sha256(await readText(file, ''));
}

function persistentSupabaseConfigReadOnly(text: string): boolean {
  if (!/supabase|mcp\.supabase\.com/i.test(text)) return true;
  const urls = [...String(text).matchAll(/https:\/\/mcp\.supabase\.com\/mcp[^"'\s)>,]*/gi)].map((match) => match[0] || '');
  if (!urls.length) return /read[_-]?only\s*=\s*true|access_mode\s*=\s*"read-only"|--read-only/.test(text);
  return urls.every((url) => {
    try {
      const parsed = new URL(url);
      return parsed.searchParams.get('read_only') === 'true';
    } catch {
      return false;
    }
  });
}
