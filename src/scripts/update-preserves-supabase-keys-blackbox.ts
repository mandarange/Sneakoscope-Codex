#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertGate, emitGate, makeTempRoot, writeText } from './sks-3-1-8-check-lib.js';
import { withSecretPreservationGuard } from '../core/config/config-migration-journal.js';

const root = await makeTempRoot('sks-update-supabase-');
const envFile = path.join(root, '.env.local');
await writeText(envFile, 'NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=update-secret\n');
await withSecretPreservationGuard(root, 'update-fixture', async () => {
  await fs.appendFile(envFile, 'SKS_UPDATE_MARKER=1\n', 'utf8');
});
await withSecretPreservationGuard(root, 'update-delete-fixture', async () => {
  await fs.writeFile(envFile, 'NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co\n', 'utf8');
});
await withSecretPreservationGuard(root, 'update-change-fixture', async () => {
  await fs.writeFile(envFile, 'NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=changed-update-secret\n', 'utf8');
});
const text = await fs.readFile(envFile, 'utf8');
const guard = JSON.parse(await fs.readFile(path.join(root, '.sneakoscope', 'reports', 'secret-preservation-guard.json'), 'utf8'));
assertGate(text.includes('update-secret'), 'update fixture must preserve Supabase key value in source file');
assertGate(guard.rollback_attempted === true && guard.rollback_ok === true, 'update fixture must rollback protected Supabase key mutation', guard);
emitGate('update:preserves-supabase-keys');
