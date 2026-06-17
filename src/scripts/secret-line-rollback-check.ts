#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertGate, emitGate, makeTempRoot, readJson, writeText } from './sks-3-1-8-check-lib.js';
import { withSecretPreservationGuard } from '../core/config/config-migration-journal.js';

const root = await makeTempRoot('sks-secret-line-rollback-');
const envFile = path.join(root, '.env.local');
await writeText(envFile, [
  'NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY=original-secret',
  'UNRELATED=value',
  ''
].join('\n'));

let blocked = false;
try {
  await withSecretPreservationGuard(root, 'fixture-line-rollback', async () => {
    await writeText(envFile, [
      'NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY=mutated-secret',
      'UNRELATED=operator-change',
      ''
    ].join('\n'));
  });
} catch {
  blocked = true;
}

const restored = await fs.readFile(envFile, 'utf8');
const report = await readJson(path.join(root, '.sneakoscope', 'reports', 'secret-preservation-guard.json')) as {
  restore_mode?: string;
  unrelated_changes_preserved?: boolean;
  changed_or_missing?: unknown[];
};
assertGate(blocked, 'secret line rollback must block protected value mutation after restoring it');
assertGate(restored.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY=original-secret'), 'secret line rollback must restore protected line');
assertGate(restored.includes('UNRELATED=operator-change'), 'secret line rollback must preserve unrelated line changes');
assertGate(report.restore_mode === 'line-level' && report.unrelated_changes_preserved === true, 'secret guard report must record line-level restoration', report);
emitGate('secret:line-rollback', { changed_or_missing: (report.changed_or_missing || []).length });
