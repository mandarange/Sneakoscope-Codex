import path from 'node:path';
import { ensureDir, nowIso, writeJsonAtomic } from '../fsx.js';
import { readCodexHookActualState } from './codex-hook-actual-discovery.js';
import type { CodexHooksLister, CodexListedHook } from './codex-hooks-list.js';

/**
 * Compare SKS's model of the hooks Codex runs with Codex's own answer
 * (app-server `hooks/list`): the same hooks, the same current hashes, the
 * same trust. A hook SKS expects that Codex does not load, or a hash that
 * differs, is the silent failure this report exists to catch.
 */
export async function codexHookOfficialParityReport(root: string, opts: { codexBin?: string | null; listHooks?: CodexHooksLister } = {}) {
  const actual = await readCodexHookActualState(root);
  const listed = opts.listHooks
    ? await opts.listHooks([root], process.env)
    : await (await import('./codex-hooks-list.js')).listCodexHooks({ cwds: [root], ...(opts.codexBin ? { codexBin: opts.codexBin } : {}) });
  const rows: CodexListedHook[] = listed.data.flatMap((entry) => entry.hooks || []);
  const entries = actual.entries.map((entry) => {
    const codexEntry = rows.find((row) => row.key === entry.key) || null;
    return {
      key: entry.key,
      source_path: entry.source_path,
      event: entry.event,
      command: entry.command,
      matcher: entry.matcher,
      current_hash_by_sks: entry.current_hash,
      current_hash_by_codex: codexEntry?.currentHash || null,
      trusted_hash: entry.trusted_hash,
      sks_trust_status: entry.trust_status,
      codex_trust_status: codexEntry?.trustStatus || (listed.ok ? 'not_loaded' : 'unavailable'),
      hash_match: codexEntry ? codexEntry.currentHash === entry.current_hash : null
    };
  });
  const mismatches = entries.filter((entry) => entry.hash_match === false);
  const notLoaded = listed.ok ? entries.filter((entry) => entry.codex_trust_status === 'not_loaded') : [];
  const trustMismatches = entries.filter((entry) => entry.hash_match === true
    && (entry.codex_trust_status === 'trusted') !== (entry.sks_trust_status === 'Trusted'));
  const blockers = [
    ...(mismatches.length ? ['codex_hook_hash_mismatch'] : []),
    ...(notLoaded.length ? ['codex_does_not_load_expected_hooks'] : []),
    ...(trustMismatches.length ? ['codex_hook_trust_mismatch'] : []),
    ...actual.blockers
  ];
  return {
    schema: 'sks.codex-hook-official-parity.v3',
    ok: blockers.length === 0,
    status: listed.ok ? 'checked_against_codex_hooks_list' : 'codex_hooks_list_unavailable',
    created_at: nowIso(),
    root,
    codex: { available: listed.ok, bin: listed.codex_bin, blocker: listed.blocker },
    counts: {
      sks_entries: entries.length,
      codex_hooks: rows.length,
      mismatches: mismatches.length,
      not_loaded: notLoaded.length,
      trust_mismatches: trustMismatches.length
    },
    entries,
    mismatches,
    not_loaded: notLoaded,
    trust_mismatches: trustMismatches,
    warnings: actual.warnings,
    blockers
  };
}

export async function writeCodexHookOfficialParityReport(root: string, opts: { codexBin?: string | null; listHooks?: CodexHooksLister; outputPath?: string } = {}) {
  const report = await codexHookOfficialParityReport(root, opts);
  const out = opts.outputPath || path.join(root, '.sneakoscope', 'reports', 'codex-hook-parity.json');
  await ensureDir(path.dirname(out));
  await writeJsonAtomic(out, report);
  return { ...report, path: out };
}
