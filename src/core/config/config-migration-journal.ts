import path from 'node:path';
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js';
import { captureSecretPreservationSnapshot, withSecretPreservationGuard } from './secret-preservation.js';

export { withSecretPreservationGuard };

export async function writeSecretMigrationJournal(root: string, operationName: string, filesTouched: string[] = []) {
  const resolvedRoot = path.resolve(root);
  const snapshot = await captureSecretPreservationSnapshot({ root: resolvedRoot });
  const journalPath = path.join(resolvedRoot, '.sneakoscope', 'reports', 'secret-migration-journal.json');
  const current = await readJson<{ entries?: unknown[] }>(journalPath, { entries: [] }).catch(() => ({ entries: [] }));
  const entries = Array.isArray(current.entries) ? current.entries : [];
  const entry = {
    schema: 'sks.secret-migration-journal-entry.v1',
    generated_at: nowIso(),
    operation: operationName,
    files_touched: filesTouched,
    protected_keys_present: snapshot.fingerprints.filter((fp) => fp.present).map((fp) => ({ key: fp.key, source: fp.source })),
    raw_values_recorded: false
  };
  const journal = {
    schema: 'sks.secret-migration-journal.v1',
    generated_at: nowIso(),
    entries: [...entries, entry]
  };
  await writeJsonAtomic(journalPath, journal);
  return { journal_path: journalPath, entry };
}
