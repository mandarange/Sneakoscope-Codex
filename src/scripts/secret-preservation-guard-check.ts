#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertGate, emitGate, makeTempRoot, writeText } from './sks-3-1-8-check-lib.js';
import { withSecretPreservationGuard } from '../core/config/config-migration-journal.js';

const root = await makeTempRoot('sks-secret-guard-');
const envFile = path.join(root, '.env.local');
await writeText(envFile, 'NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=guard-secret\n');
await withSecretPreservationGuard(root, 'fixture-preserve', async () => {
  await fs.appendFile(envFile, 'SKS_MANAGED=1\n', 'utf8');
});
let blocked = false;
try {
  await withSecretPreservationGuard(root, 'fixture-delete', async () => {
    await fs.writeFile(envFile, 'SKS_MANAGED=1\n', 'utf8');
  });
} catch {
  blocked = true;
}
assertGate(blocked, 'secret preservation guard must block missing protected keys after mutation');
emitGate('secret:preservation-guard');
