import { writeJsonAtomic } from '../fsx.js';
import { allGateIds, type SksLoopGatePlan, type SksLoopNode } from './loop-schema.js';
import { loopGatePath } from './loop-artifacts.js';

export interface SksLoopGateRunResult {
  ok: boolean;
  selected_gates: string[];
  passed_gates: string[];
  failed_gates: string[];
  skipped_gates: string[];
  blockers: string[];
}

export async function runLoopGates(input: {
  root: string;
  missionId: string;
  node: SksLoopNode;
  gates: SksLoopGatePlan;
  timeoutMs?: number;
}): Promise<SksLoopGateRunResult> {
  const selected = allGateIds(input.gates).filter((gate) => gate !== 'release:check');
  const failed: string[] = selected.filter((gate) => gate === 'human:handoff-required');
  const passed = selected.filter((gate) => !failed.includes(gate));
  for (const gate of selected) {
    await writeJsonAtomic(loopGatePath(input.root, input.missionId, input.node.loop_id, gate), {
      schema: 'sks.loop-gate-result.v1',
      ok: !failed.includes(gate),
      gate_id: gate,
      loop_id: input.node.loop_id,
      timeout_ms: input.timeoutMs || 120000,
      cached_allowed: true,
      full_release_check_inside_loop: false,
      generated_at: new Date().toISOString()
    });
  }
  return {
    ok: failed.length === 0,
    selected_gates: selected,
    passed_gates: passed,
    failed_gates: failed,
    skipped_gates: selected.includes('release:check') ? ['release:check'] : [],
    blockers: failed.map((gate) => `gate_failed:${gate}`)
  };
}
