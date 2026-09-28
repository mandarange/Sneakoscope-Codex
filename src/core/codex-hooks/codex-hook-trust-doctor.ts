import { readCodexHookTrustEntries } from './codex-hook-trust-state.js';
import { readCodexHookActualState } from './codex-hook-actual-discovery.js';

// Every repair converges on activateSksCodexHooks: user-level hooks plus trust
// Codex honours (from the user config only).
async function activate(root: string) {
  const { activateSksCodexHooks } = await import('./codex-project-hooks.js');
  return activateSksCodexHooks({ root }).catch((err: unknown) => ({
    ok: false,
    blockers: [err instanceof Error ? err.message : String(err)]
  }));
}

export async function codexHookTrustDoctor(root: string, opts: { fix?: boolean; managed?: boolean; actual?: boolean } = {}) {
  if (opts.actual === true) return codexHookActualTrustDoctor(root, opts);
  const trustOpts = opts.managed === undefined ? {} : { managed: opts.managed };
  const fixed = opts.fix === true ? await activate(root) : null;
  const entries = await readCodexHookTrustEntries(root, trustOpts);
  const warnings = entries.flatMap((entry) => entry.warnings);
  return {
    schema: 'sks.codex-hook-trust-doctor.v1',
    ok: warnings.length === 0,
    fixed,
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
  const fixed = opts.fix === true ? await activate(root) : null;
  const state = await readCodexHookActualState(root);
  const entries = state.entries.map((entry) => {
    if (entry.trust_status === 'Managed' || entry.trust_status === 'Trusted') return entry;
    return { ...entry, repair_action: 'sks doctor --fix' };
  });
  const warnings = [...new Set([...state.warnings, ...entries.flatMap((entry) => entry.warnings || [])])];
  return {
    schema: 'sks.codex-hook-trust-doctor.v2',
    ok: state.ok && entries.every((entry) => entry.trust_status === 'Managed' || entry.trust_status === 'Trusted'),
    actual: true,
    fix_attempted: opts.fix === true,
    fix_status: opts.fix === true ? (fixed?.ok === true ? 'sks_hooks_activated' : 'sks_hook_activation_failed') : 'not_requested',
    fixed,
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
    blockers: [...new Set([...state.blockers, ...entries.filter((entry) => entry.trust_status !== 'Managed' && entry.trust_status !== 'Trusted').map((entry) => `untrusted_hook:${entry.key}`)])],
    repair_actions: [...new Set(entries.map((entry) => entry.repair_action).filter((value): value is string => Boolean(value)))]
  };
}
