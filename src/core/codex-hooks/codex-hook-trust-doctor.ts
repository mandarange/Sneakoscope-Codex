import { readCodexHookTrustEntries } from './codex-hook-trust-state.js';
import { writeTrustedHashStateForHooksFile } from './codex-hook-state-writer.js';
import { readCodexHookActualState } from './codex-hook-actual-discovery.js';
import { installManagedCodexHooks } from './codex-hook-managed-install.js';

export async function codexHookTrustDoctor(root: string, opts: { fix?: boolean; managed?: boolean; actual?: boolean } = {}) {
  if (opts.actual === true) return codexHookActualTrustDoctor(root, opts);
  const fix = opts.fix === true;
  const trustOpts = opts.managed === undefined ? {} : { managed: opts.managed };
  const before = await readCodexHookTrustEntries(root, trustOpts);
  const fixed = fix ? await writeTrustedHashStateForHooksFile(root, undefined, undefined, { allowSksHashFallback: false }).catch((err: unknown) => ({
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

async function codexHookActualTrustDoctor(root: string, opts: { fix?: boolean; managed?: boolean } = {}) {
  const fixed = opts.fix === true ? await installManagedCodexHooks(root).catch((err: unknown) => ({
    ok: false,
    error: err instanceof Error ? err.message : String(err)
  })) : null;
  const state = await readCodexHookActualState(root);
  const entries = state.entries.map((entry) => {
    if (entry.trust_status === 'Managed' || entry.trust_status === 'Trusted') return entry;
    return { ...entry, repair_action: 'sks hooks repair --managed --json' };
  });
  const warnings = [...new Set([...state.warnings, ...entries.flatMap((entry) => entry.warnings || [])])];
  const managedOnlyRecommendation = state.managed_dirs.length === 0 && entries.some((entry) => entry.trust_status !== 'Managed');
  const repairActions = [
    ...(managedOnlyRecommendation ? ['sks hooks install --managed --json'] : []),
    ...entries.map((entry) => entry.repair_action).filter((value): value is string => Boolean(value))
  ];
  return {
    schema: 'sks.codex-hook-trust-doctor.v2',
    ok: state.ok && warnings.length === 0,
    actual: true,
    fix_attempted: opts.fix === true,
    fix_status: opts.fix === true ? (fixed && 'ok' in fixed && fixed.ok === true ? 'managed_install_applied' : 'managed_install_failed') : 'not_requested',
    fixed,
    managed_mode_requested: opts.managed === true,
    current_hash_count: entries.length,
    entries,
    sources: state.sources,
    managed_dirs: state.managed_dirs,
    unsupported_handlers: state.unsupported_handlers,
    invalid_matchers: state.invalid_matchers,
    dual_representation: state.dual_representation,
    trust: {
      managed: entries.filter((entry) => entry.trust_status === 'Managed').length,
      trusted: entries.filter((entry) => entry.trust_status === 'Trusted').length,
      modified: entries.filter((entry) => entry.trust_status === 'Modified').length,
      untrusted: entries.filter((entry) => entry.trust_status === 'Untrusted').length
    },
    warnings,
    blockers: [...new Set([...state.blockers, ...(warnings.length ? warnings : [])])],
    repair_actions: [...new Set(repairActions)],
    policy: {
      official_hash_available: false,
      trusted_hash_writer_policy: 'managed_install_required_when_official_hash_is_unavailable',
      sks_hash_fallback_allowed: false
    }
  };
}
