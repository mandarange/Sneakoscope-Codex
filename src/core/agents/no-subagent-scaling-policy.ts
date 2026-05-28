import path from 'node:path'
import { nowIso, readJson, readText, writeJsonAtomic } from '../fsx.js'

export const NO_SUBAGENT_SCALING_POLICY_SCHEMA = 'sks.no-subagent-scaling-policy.v1'

export async function writeNoSubagentScalingPolicy(root: string, input: { nativeProof?: any } = {}) {
  const nativeProof = input.nativeProof || await readJson<any>(path.join(root, 'native-cli-session-proof.json'), null)
  const swarm = await readJson<any>(path.join(root, 'agent-native-cli-session-swarm.json'), null)
  const events = await readText(path.join(root, 'agent-events.jsonl'), '')
  const subagentEventCount = String(events).split(/\n/).filter((line) => /Subagent(Start|Stop)|subagent/i.test(line)).length
  const nativeProcessCount = Number(nativeProof?.spawned_worker_process_count || swarm?.spawned_worker_process_count || 0)
  const blockers = [
    ...(swarm?.scaling_primitive === 'native_cli_process' ? [] : ['main_scaling_primitive_not_native_cli_process']),
    ...(nativeProcessCount > 0 ? [] : ['native_cli_worker_process_proof_missing']),
    ...(nativeProof?.worker_proof_is_only_subagent_events === true ? ['worker_proof_only_subagent_events'] : [])
  ]
  const report = {
    schema: NO_SUBAGENT_SCALING_POLICY_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    main_orchestrator_scaling_primitive: 'native_cli_process',
    subagent_events_counted_as_worker_sessions: false,
    scout_events_counted_as_worker_sessions: false,
    worker_internal_scout_usage_allowed_as_helper_only: true,
    native_worker_process_count: nativeProcessCount,
    subagent_event_count: subagentEventCount,
    worker_process_proof: 'native-cli-session-proof.json',
    swarm_proof: 'agent-native-cli-session-swarm.json',
    runtime_truth_row: 'native_cli_session_swarm',
    blockers
  }
  await writeJsonAtomic(path.join(root, 'no-subagent-scaling-policy.json'), report)
  return report
}
