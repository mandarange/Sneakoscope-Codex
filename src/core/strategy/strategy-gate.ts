import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import type { StrategyCompileResult } from './strategy-compiler.js'

export const STRATEGY_GATE_SCHEMA = 'sks.strategy-gate.v1'

export interface StrategyGateResult {
  schema: typeof STRATEGY_GATE_SCHEMA
  generated_at: string
  ok: boolean
  strategy_first_required: boolean
  scheduler_allowed: boolean
  write_capable: boolean
  adhd_orchestrating_gate_ok: boolean
  parallel_modification_plan_ok: boolean
  file_ownership_plan_ok: boolean
  verification_rollback_dag_ok: boolean
  appshots_operator_action_required: boolean
  micro_win_count: number
  blockers: string[]
}

export function evaluateStrategyGate(input: {
  compiled: StrategyCompileResult
  writeCapable?: boolean
  visualRequired?: boolean
  appshotsOk?: boolean
  sourceIntelligenceOk?: boolean
  sourceIntelligenceRequired?: boolean
}): StrategyGateResult {
  const writeCapable = input.writeCapable === true
  const sourceIntelligenceRequired = input.sourceIntelligenceRequired !== false
  const gate = input.compiled.gate
  const strategyFirstRequired = writeCapable || gate.visual_appshot_required_count > 0 || input.visualRequired === true
  const blockers = [
    ...input.compiled.blockers,
    ...(strategyFirstRequired && !gate.ok ? gate.blockers : []),
    ...(writeCapable && !input.compiled.file_ownership_plan.no_overlap ? ['write_file_ownership_overlap'] : []),
    ...(writeCapable && !input.compiled.verification_rollback_dag.rollback_ready ? ['write_rollback_dag_missing'] : []),
    ...(writeCapable && input.visualRequired === true && input.appshotsOk !== true
      ? ['appshots_operator_action_missing_for_visual_proof']
      : []),
    ...(writeCapable && sourceIntelligenceRequired && input.sourceIntelligenceOk === false ? ['source_intelligence_gate_failed'] : [])
  ]
  return {
    schema: STRATEGY_GATE_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    strategy_first_required: strategyFirstRequired,
    scheduler_allowed: blockers.length === 0,
    write_capable: writeCapable,
    adhd_orchestrating_gate_ok: gate.ok,
    parallel_modification_plan_ok: input.compiled.parallel_modification_plan.serial_conflicts.length === 0,
    file_ownership_plan_ok: input.compiled.file_ownership_plan.no_overlap,
    verification_rollback_dag_ok: input.compiled.verification_rollback_dag.rollback_ready,
    appshots_operator_action_required: gate.visual_appshot_required_count > 0,
    micro_win_count: gate.micro_wins.length,
    blockers: [...new Set(blockers)]
  }
}

export async function writeStrategyGateArtifact(root: string, gate: StrategyGateResult) {
  await writeJsonAtomic(path.join(root, 'strategy-gate.json'), gate)
  return gate
}
