import path from 'node:path';
import { retargetLiveManagedHookScript } from '../../codex-hooks/codex-hook-managed-install.js';
import { codexHookTrustDoctor } from '../../codex-hooks/codex-hook-trust-doctor.js';
import { codexHomePath } from '../../codex-app/codex-model-catalog.js';
import { readText, writeTextAtomic } from '../../fsx.js';
import { managedHookEventNames, pruneRetiredSksHookEvents } from '../../init.js';
import type { UpdateMigrationStageRun } from '../update-migration-state.js';

type StageOutcome = Omit<UpdateMigrationStageRun, 'schema' | 'id' | 'min_from_version' | 'from_version'>;

export async function runOtherHarnessCleanupStage(root: string): Promise<StageOutcome> {
  const { cleanupOtherHarnessConflicts, scanHarnessConflicts } = await import('../../harness-conflicts.js');
  const scan = await scanHarnessConflicts(root);
  if (!scan.hard_block) {
    return {
      ok: true,
      status: 'ok',
      actions: ['other_harness_conflict_check_clean'],
      blockers: [],
      warnings: [],
      detail: {
        cleaned_count: 0,
        remaining_count: 0,
        error_count: 0
      }
    };
  }
  const cleanup = await cleanupOtherHarnessConflicts(root);
  const remaining = Array.isArray(cleanup.remaining) ? cleanup.remaining : [];
  const errors = Array.isArray(cleanup.errors) ? cleanup.errors : [];
  const blockers = [
    ...remaining.map((row: { path?: string }) => `other_harness_conflict:${row.path || 'unknown'}`),
    ...errors.map((row: { path?: string; error?: string }) => `other_harness_cleanup_failed:${row.path || 'unknown'}:${row.error || 'error'}`),
  ];
  return {
    ok: blockers.length === 0,
    status: blockers.length ? 'failed' : 'ok',
    actions: ['other_harness_conflicts_quarantined'],
    blockers,
    warnings: [],
    detail: {
      cleaned_count: Array.isArray(cleanup.cleaned) ? cleanup.cleaned.length : 0,
      remaining_count: remaining.length,
      error_count: errors.length
    }
  };
}

/**
 * Remove SKS hook entries for events the current profile no longer installs
 * from the project and user hooks.json. Runs before the trust refresh so the
 * refreshed trust hashes describe the pruned files.
 */
async function pruneRetiredSksHookFiles(root: string): Promise<string[]> {
  const installed = managedHookEventNames(root);
  const files = [...new Set([
    path.join(root, '.codex', 'hooks.json'),
    path.join(codexHomePath(), 'hooks.json')
  ])];
  const actions: string[] = [];
  for (const file of files) {
    const before = await readText(file, '');
    if (!before.trim()) continue;
    const pruned = pruneRetiredSksHookEvents(before, installed);
    if (!pruned.removed.length) continue;
    await writeTextAtomic(file, pruned.text);
    actions.push(`pruned_retired_sks_hook_events:${pruned.removed.join('+')}`);
  }
  return actions;
}

export async function runHookTrustRefreshStage(root: string): Promise<StageOutcome> {
  const pruneActions = await pruneRetiredSksHookFiles(root).catch(() => [] as string[]);
  const result = await codexHookTrustDoctor(root, { fix: true, managed: true, actual: true });
  const liveHook = await retargetLiveManagedHookScript(process.env).catch((err: unknown) => ({
    ok: false,
    status: 'absent' as const,
    script: null,
    command: null,
    error: err instanceof Error ? err.message : String(err)
  }));
  const blockers = [
    ...((result as any).ok === false ? ((result as any).blockers || ['hook_trust_refresh_failed']) : []),
    ...(liveHook.ok === false ? [`live_managed_hook_retarget_failed:${(liveHook as { error?: string }).error || liveHook.status}`] : [])
  ];
  return {
    ok: blockers.length === 0,
    status: blockers.length ? 'failed' : 'ok',
    actions: [...pruneActions, 'refreshed_hook_trust', ...(liveHook.status === 'rewritten' ? ['retargeted_live_managed_hook'] : [])],
    blockers,
    warnings: (result as any).warnings || [],
    detail: {
      entries: (result as any).current_hash_count ?? null,
      live_hook_status: liveHook.status,
      live_hook_script: liveHook.script
    }
  };
}
