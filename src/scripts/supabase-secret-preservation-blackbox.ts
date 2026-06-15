#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertGate, emitGate, makeTempRoot, writeText } from './sks-3-1-8-check-lib.js';
import { captureSecretPreservationSnapshot, withSecretPreservationGuard } from '../core/config/secret-preservation.js';

const root = await makeTempRoot('sks-supabase-blackbox-');
const envFile = path.join(root, '.env.local');
await writeText(envFile, 'NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=super-secret-anon\n');
const before = await captureSecretPreservationSnapshot({ root });
await withSecretPreservationGuard(root, 'blackbox-preserve', async () => {
  await fs.appendFile(envFile, 'SKS_MANAGED=true\n', 'utf8');
});
const after = await captureSecretPreservationSnapshot({ root });
assertGate(JSON.stringify(before.fingerprints.map((fp) => fp.value_sha256).sort()) === JSON.stringify(after.fingerprints.map((fp) => fp.value_sha256).sort()), 'Supabase secret fingerprints must remain stable across guarded update', { before, after });
assertGate(!JSON.stringify(after).includes('super-secret-anon'), 'reports must not include raw Supabase values', after);
emitGate('secret:supabase-preservation-blackbox');
