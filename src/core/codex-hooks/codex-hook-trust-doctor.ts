import { readCodexHookTrustEntries } from './codex-hook-trust-state.js';
import { writeTrustedHashStateForHooksFile } from './codex-hook-state-writer.js';

export async function codexHookTrustDoctor(root: string, opts: { fix?: boolean; managed?: boolean } = {}) {
  const fix = opts.fix === true;
  const trustOpts = opts.managed === undefined ? {} : { managed: opts.managed };
  const before = await readCodexHookTrustEntries(root, trustOpts);
  const fixed = fix ? await writeTrustedHashStateForHooksFile(root).catch((err: unknown) => ({
    ok: false,
    error: err instanceof Error ? err.message : String(err)
  })) : null;
  const entries = fix ? await readCodexHookTrustEntries(root, trustOpts) : before;
  const warnings = entries.flatMap((entry) => entry.warnings);
  return {
    schema: 'sks.codex-hook-trust-doctor.v1',
    ok: warnings.length === 0,
    fixed: fixed && 'ok' in fixed ? fixed : null,
    current_hash_count: entries.length,
    entries,
    trust: {
      managed: entries.filter((entry) => entry.trust_status === 'Managed').length,
      trusted: entries.filter((entry) => entry.trust_status === 'Trusted').length,
      modified: entries.filter((entry) => entry.trust_status === 'Modified').length,
      untrusted: entries.filter((entry) => entry.trust_status === 'Untrusted').length
    },
    warnings,
    repair_actions: [...new Set(entries.map((entry) => entry.repair_action).filter((value): value is string => Boolean(value)))]
  };
}
