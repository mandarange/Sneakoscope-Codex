import { appendJsonl, readText } from '../fsx.js';
import { loopMutationLedgerPath } from './loop-artifacts.js';
import type { LoopIntegrationMergeResult } from './loop-integration-merge.js';
import type { SksLoopProof } from './loop-schema.js';
import { enforceLoopOwnerScope } from './loop-worktree-runtime.js';

export interface LoopMutationLedgerEvent {
  schema: 'sks.loop-mutation-ledger-event.v1';
  ts: string;
  mission_id: string;
  loop_id: string;
  event_type: 'file_changed' | 'owner_scope_violation' | 'gate_side_effect' | 'merge_applied' | 'merge_conflict';
  file_path: string | null;
  source: 'git-diff' | 'gate-result' | 'integration-merge' | 'worker-result';
  allowed_by_owner_scope: boolean;
  details: Record<string, unknown>;
}

export async function appendLoopMutationEvent(root: string, missionId: string, event: Omit<LoopMutationLedgerEvent, 'schema' | 'ts' | 'mission_id'> & { ts?: string }): Promise<void> {
  await appendJsonl(loopMutationLedgerPath(root, missionId), {
    schema: 'sks.loop-mutation-ledger-event.v1',
    ts: event.ts || new Date().toISOString(),
    mission_id: missionId,
    loop_id: event.loop_id,
    event_type: event.event_type,
    file_path: event.file_path,
    source: event.source,
    allowed_by_owner_scope: event.allowed_by_owner_scope,
    details: event.details
  });
}

export async function readLoopMutationLedger(root: string, missionId: string): Promise<LoopMutationLedgerEvent[]> {
  const text = await readText(loopMutationLedgerPath(root, missionId), '');
  return String(text).split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as LoopMutationLedgerEvent;
      } catch {
        return null;
      }
    })
    .filter((row): row is LoopMutationLedgerEvent => Boolean(row));
}

export async function mutationLedgerFromLoopProofs(input: {
  root: string;
  missionId: string;
  proofs: SksLoopProof[];
  integrationMerge?: LoopIntegrationMergeResult | null;
}): Promise<LoopMutationLedgerEvent[]> {
  const events: LoopMutationLedgerEvent[] = [];
  for (const proof of input.proofs) {
    const workerChanged = [...new Set([...(proof.maker_result.changed_files || []), ...proof.changed_files])];
    for (const file of workerChanged) {
      const violations = enforceLoopOwnerScope([file], proof.owner_scope);
      const eventType = violations.length ? 'owner_scope_violation' : 'file_changed';
      const event: LoopMutationLedgerEvent = {
        schema: 'sks.loop-mutation-ledger-event.v1',
        ts: new Date().toISOString(),
        mission_id: input.missionId,
        loop_id: proof.loop_id,
        event_type: eventType,
        file_path: file,
        source: 'git-diff',
        allowed_by_owner_scope: violations.length === 0,
        details: { status: proof.status, blockers: violations }
      };
      events.push(event);
      await appendJsonl(loopMutationLedgerPath(input.root, input.missionId), event);
    }
    if (proof.gate_result.blockers?.some((blocker) => blocker.includes('side_effect') || blocker.includes('mutation'))) {
      const event: LoopMutationLedgerEvent = {
        schema: 'sks.loop-mutation-ledger-event.v1',
        ts: new Date().toISOString(),
        mission_id: input.missionId,
        loop_id: proof.loop_id,
        event_type: 'gate_side_effect',
        file_path: null,
        source: 'gate-result',
        allowed_by_owner_scope: false,
        details: { blockers: proof.gate_result.blockers || [] }
      };
      events.push(event);
      await appendJsonl(loopMutationLedgerPath(input.root, input.missionId), event);
    }
  }
  if (input.integrationMerge) {
    for (const loopId of input.integrationMerge.applied_loops) {
      const event: LoopMutationLedgerEvent = {
        schema: 'sks.loop-mutation-ledger-event.v1',
        ts: new Date().toISOString(),
        mission_id: input.missionId,
        loop_id: loopId,
        event_type: 'merge_applied',
        file_path: null,
        source: 'integration-merge',
        allowed_by_owner_scope: true,
        details: { changed_files: input.integrationMerge.changed_files }
      };
      events.push(event);
      await appendJsonl(loopMutationLedgerPath(input.root, input.missionId), event);
    }
    for (const loopId of input.integrationMerge.conflict_loops) {
      const event: LoopMutationLedgerEvent = {
        schema: 'sks.loop-mutation-ledger-event.v1',
        ts: new Date().toISOString(),
        mission_id: input.missionId,
        loop_id: loopId,
        event_type: 'merge_conflict',
        file_path: null,
        source: 'integration-merge',
        allowed_by_owner_scope: false,
        details: { blockers: input.integrationMerge.blockers }
      };
      events.push(event);
      await appendJsonl(loopMutationLedgerPath(input.root, input.missionId), event);
    }
  }
  return events;
}
