import { nowIso } from './fsx.js'
import { RELEASE_GATE_CONTRACT_IDS, releaseGateContractSnapshot } from './release/release-gate-contract.js'

export const RELEASE_PARALLEL_FULL_COVERAGE_SCHEMA = 'sks.release-parallel-full-coverage.v2'

// Compatibility export: the independent, versioned contract is now the full
// release preset, not a self-authorizing critical subset.
export const RELEASE_DAG_CRITICAL_GATES = RELEASE_GATE_CONTRACT_IDS

export function evaluateReleaseParallelFullCoverage(currentGateIds: string[]) {
  const raw = currentGateIds.map(String).filter(Boolean)
  const current = [...new Set(raw)].sort()
  const contract = releaseGateContractSnapshot()
  const missingCritical = contract.ids.filter((gate) => !current.includes(gate))
  const unexpectedGates = current.filter((gate) => !contract.ids.includes(gate))
  const duplicateGateIds = [...new Set(raw.filter((id, index) => raw.indexOf(id) !== index))].sort()
  const independentGroups = {
    release_integrity: current.filter((gate) => /^(?:architecture:|policy:|release:|typecheck$|schema:check$)/.test(gate)),
    official_subagents: current.filter((gate) => /official-subagent|native-agent|naruto:/.test(gate)),
    runtime_recovery: current.filter((gate) => /codex-lb|runtime-recovery|responses:/.test(gate)),
    feature_closure: current.filter((gate) => /all-features|feature|research:/.test(gate))
  }
  return {
    schema: RELEASE_PARALLEL_FULL_COVERAGE_SCHEMA,
    generated_at: nowIso(),
    ok: current.length > 0
      && current.length <= 200
      && missingCritical.length === 0
      && unexpectedGates.length === 0
      && duplicateGateIds.length === 0,
    authoritative_source: 'src/core/release/release-gate-contract.ts',
    manifest_source: 'release-gates.v2.json',
    release_gate_contract: contract,
    legacy_runner_snapshot_retired: true,
    critical_gate_count: RELEASE_DAG_CRITICAL_GATES.length,
    current_gate_count: current.length,
    current_gate_list: current,
    missing_critical_gates: missingCritical,
    unexpected_release_gates: unexpectedGates,
    duplicate_gate_ids: duplicateGateIds,
    gate_budget_ok: current.length > 0 && current.length <= 200,
    coverage_regression: missingCritical.length > 0 || unexpectedGates.length > 0,
    independent_groups: independentGroups,
    speedup_summary: {
      parallel_groups: Object.values(independentGroups).filter((rows) => rows.length > 0).length,
      execution_model: 'manifest-backed parallel DAG'
    }
  }
}
