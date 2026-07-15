import path from 'node:path';
import { reconcileRetiredArtifactResidue } from './retired-managed-residue-artifacts.js';
import { type MutableCounters } from './retired-managed-residue-private.js';
import { reconcileRetiredStateResidue } from './retired-managed-residue-state.js';

export const RETIRED_MANAGED_RESIDUE_SCHEMA = 'sks.retired-managed-residue.v1' as const;

export interface RetiredManagedResidueReport {
  schema: typeof RETIRED_MANAGED_RESIDUE_SCHEMA;
  ok: boolean;
  fix: boolean;
  detected_managed_artifact_count: number;
  removed_managed_artifact_count: number;
  rewritten_state_file_count: number;
  agent_bridge_manifest: 'absent' | 'current' | 'reconciled' | 'would_reconcile' | 'user_collision_quarantined' | 'user_collision_preserved';
  preserved_user_file_count: number;
  remaining_managed_artifact_count: number;
  error_count: number;
}

export async function reconcileRetiredManagedResidue(opts: { root: string; fix: boolean }): Promise<RetiredManagedResidueReport> {
  const counters: MutableCounters = {
    detected: 0,
    removed: 0,
    rewrittenState: 0,
    preserved: 0,
    remaining: 0,
    errors: 0
  };
  const quarantineRoot = path.join(opts.root, '.sneakoscope', 'quarantine', 'retired-public-surface', `${Date.now()}-${process.pid}`);

  await reconcileRetiredArtifactResidue({
    root: opts.root,
    fix: opts.fix,
    quarantineRoot,
    counters
  });
  const agentBridgeManifest = await reconcileRetiredStateResidue({
    root: opts.root,
    fix: opts.fix,
    quarantineRoot,
    counters
  });

  return {
    schema: RETIRED_MANAGED_RESIDUE_SCHEMA,
    ok: counters.remaining === 0 && counters.errors === 0,
    fix: opts.fix,
    detected_managed_artifact_count: counters.detected,
    removed_managed_artifact_count: counters.removed,
    rewritten_state_file_count: counters.rewrittenState,
    agent_bridge_manifest: agentBridgeManifest,
    preserved_user_file_count: counters.preserved,
    remaining_managed_artifact_count: counters.remaining,
    error_count: counters.errors
  };
}
