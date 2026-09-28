import path from 'node:path';
import { activateSksCodexHooks } from '../../codex-hooks/codex-project-hooks.js';
import { compareSemVer } from '../semver.js';
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

/**
 * SKS hooks for every Codex project: the user-level hooks.json (the one hook
 * source Codex loads everywhere), trust Codex honours, the global rules
 * block, and this project's leftovers. Every `sks update` runs this, for the
 * cwd project and for the fan-out to other known projects.
 */
export async function runHookTrustRefreshStage(root: string, fromVersion: string | null = null): Promise<StageOutcome> {
  const pruneActions = await pruneRetiredSksHookFiles(root).catch(() => [] as string[]);
  // An update from 10.3.8 or older finishes with that version's check, which
  // counts the old user-level managed hooks: they stay (inert) until the next update.
  const fromOrder = fromVersion ? compareSemVer(fromVersion, '10.3.9') : null;
  const keepLegacyManagedDir = fromOrder === null || fromOrder < 0;
  const activation = await activateSksCodexHooks({ root, keepLegacyManagedDir });
  const verification = activation.global.verification;
  return {
    ok: activation.ok,
    status: activation.ok ? 'ok' : 'failed',
    actions: [...pruneActions, ...activation.actions, activation.active ? 'sks_hooks_active_for_every_project' : 'sks_hooks_not_active'],
    blockers: activation.blockers,
    warnings: activation.warnings,
    detail: {
      hooks_path: activation.global.hooks_path,
      launcher_target: activation.global.target.source,
      verified_by_codex: verification?.checked === true,
      codex_bin: verification?.codex_bin || null,
      pinned_project_events: activation.project.pinned_events
    }
  };
}
