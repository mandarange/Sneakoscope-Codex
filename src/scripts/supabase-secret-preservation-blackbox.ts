#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertGate, emitGate, makeTempRoot, writeText } from './sks-3-1-8-check-lib.js';
import { captureSecretPreservationSnapshot, withSecretPreservationGuard } from '../core/config/secret-preservation.js';

const root = await makeTempRoot('sks-supabase-blackbox-');
process.env.HOME = path.join(root, 'home');
const envFile = path.join(root, '.env.local');
const homeCodexConfig = path.join(process.env.HOME, '.codex', 'config.toml');
await writeText(envFile, 'NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=super-secret-anon\nSUPABASE_SERVICE_ROLE_KEY=super-secret-service\n');
await writeText(homeCodexConfig, '[mcp.supabase]\ntoken = "home-token-secret"\n');
const before = await captureSecretPreservationSnapshot({ root });
await withSecretPreservationGuard(root, 'blackbox-preserve', async () => {
  await fs.appendFile(envFile, 'SKS_MANAGED=true\n', 'utf8');
});
await withSecretPreservationGuard(root, 'blackbox-delete', async () => {
  await fs.writeFile(envFile, 'NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=super-secret-service\n', 'utf8');
});
await withSecretPreservationGuard(root, 'blackbox-change', async () => {
  await fs.writeFile(envFile, 'NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=changed-secret\nSUPABASE_SERVICE_ROLE_KEY=super-secret-service\n', 'utf8');
});
await withSecretPreservationGuard(root, 'blackbox-add', async () => {
  await fs.appendFile(envFile, 'VITE_SUPABASE_ANON_KEY=new-secret-is-allowed\n', 'utf8');
});
await withSecretPreservationGuard(root, 'blackbox-home-token-change', async () => {
  await fs.writeFile(homeCodexConfig, '[mcp.supabase]\ntoken = "changed-home-token"\n', 'utf8');
});
const after = await captureSecretPreservationSnapshot({ root });
const afterText = await fs.readFile(envFile, 'utf8');
const homeText = await fs.readFile(homeCodexConfig, 'utf8');
const reportDirText = JSON.stringify(await readReports(path.join(root, '.sneakoscope', 'reports')));
assertGate(afterText.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY=super-secret-anon'), 'deleted/changed Supabase anon key must rollback to original value', afterText);
assertGate(afterText.includes('VITE_SUPABASE_ANON_KEY=new-secret-is-allowed'), 'new Supabase keys added after snapshot must be allowed', afterText);
assertGate(homeText.includes('home-token-secret'), 'home Codex Supabase MCP token must rollback after mutation', homeText);
for (const fp of before.fingerprints) {
  const match = after.fingerprints.find((row) => row.source === fp.source && row.key === fp.key);
  assertGate(match?.value_sha256 === fp.value_sha256, 'pre-existing Supabase secret fingerprints must remain stable across guarded operations', { fp, match });
}
assertGate(!reportDirText.includes('super-secret-anon') && !reportDirText.includes('super-secret-service') && !reportDirText.includes('home-token-secret'), 'reports must not include raw Supabase values', reportDirText);
emitGate('secret:supabase-preservation-blackbox');

async function readReports(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const rows = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const row of rows) {
    if (row.isFile()) out[row.name] = await fs.readFile(path.join(dir, row.name), 'utf8');
  }
  return out;
}
