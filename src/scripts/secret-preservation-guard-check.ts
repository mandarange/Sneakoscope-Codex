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
await withSecretPreservationGuard(root, 'fixture-delete', async () => {
  await fs.writeFile(envFile, 'SKS_MANAGED=1\n', 'utf8');
});
const restored = await fs.readFile(envFile, 'utf8');
const report = JSON.parse(await fs.readFile(path.join(root, '.sneakoscope', 'reports', 'secret-preservation-guard.json'), 'utf8'));
assertGate(restored.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY=guard-secret'), 'secret preservation guard must restore missing protected keys after mutation', restored);
assertGate(report.rollback_attempted === true && report.rollback_ok === true && report.restored_keys_count > 0, 'secret preservation guard must report rollback success', report);
let threw = false;
try {
  await withSecretPreservationGuard(root, 'fixture-throw-after-mutation', async () => {
    await fs.writeFile(envFile, 'NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=changed-before-throw\n', 'utf8');
    throw new Error('fixture failure with NEXT_PUBLIC_SUPABASE_ANON_KEY=raw-should-redact');
  });
} catch {
  threw = true;
}
const restoredAfterThrow = await fs.readFile(envFile, 'utf8');
const throwReportText = await fs.readFile(path.join(root, '.sneakoscope', 'reports', 'secret-preservation-guard.json'), 'utf8');
const throwReport = JSON.parse(throwReportText);
assertGate(threw, 'secret preservation guard must rethrow operation errors after rollback');
assertGate(restoredAfterThrow.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY=guard-secret'), 'secret preservation guard must rollback protected mutation even when operation throws', restoredAfterThrow);
assertGate(throwReport.rollback_attempted === true && throwReport.rollback_ok === true && throwReport.ok === false, 'throwing mutation report must record rollback success but failed operation', throwReport);
assertGate(!throwReportText.includes('changed-before-throw') && !throwReportText.includes('raw-should-redact'), 'throwing mutation report must not leak raw secret values', throwReportText);
emitGate('secret:preservation-guard');
