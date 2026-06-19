export type StopGateStatus = 'passed' | 'blocked' | 'failed' | 'hard_blocked';

export type StopGateTerminalState =
  | 'completed'
  | 'partial_candidates'
  | 'blocked'
  | 'failed'
  | 'timeout'
  | 'hard_blocked';

export type StopGateAction = 'allow_stop' | 'continue' | 'hard_blocked';

export interface SksStopGateEvidence {
  readonly build_passed?: boolean;
  readonly tests_passed?: boolean;
  readonly test_count?: number;
  readonly release_metadata_passed?: boolean;
  readonly version_truth_passed?: boolean;
  readonly ci_cd_unchanged?: boolean;
  readonly main_push_commit?: string | null;
  readonly native_session_split_evidence?: string | null;
  readonly route_evidence_passed?: boolean;
  readonly proof_required?: boolean;
  readonly proof_passed?: boolean;
  readonly reflection_required?: boolean;
  readonly reflection_passed?: boolean | 'not_required';
  readonly per_worker_artifacts?: boolean;
  readonly verifier_wave_run?: boolean;
  readonly model_guard_enforced?: boolean;
  readonly final_seal_passed?: boolean;
  readonly final_seal_path?: string | null;
  readonly required_coverage_passed?: boolean;
  readonly uncovered_required_count?: number;
  readonly coverage_ledger_path?: string | null;
  readonly parallelism_summary_path?: string | null;
  readonly critical_path_path?: string | null;
  readonly stream_idle_timeout_ms?: number | null;
}

export interface SksStopGateV1 {
  readonly schema: 'sks.stop-gate.v1';
  readonly route: string;
  readonly route_command: string;
  readonly mission_id: string;
  readonly gate_file: string;
  readonly gate_abs_path: string;
  readonly status: StopGateStatus;
  readonly passed: boolean;
  readonly terminal: boolean;
  readonly terminal_state: StopGateTerminalState;
  readonly evidence: SksStopGateEvidence;
  readonly blockers: readonly string[];
  readonly missing_fields: readonly string[];
  readonly created_at: string;
}

export interface StopGateDiagnostics {
  readonly schema: 'sks.stop-gate-diagnostics.v1';
  readonly resolved_root: string;
  readonly route: string | null;
  readonly mission_id: string | null;
  readonly checked_paths: readonly string[];
  readonly selected_gate_path: string | null;
  readonly selected_gate_schema: string | null;
  readonly selected_gate_sha256: string | null;
  readonly selected_gate_mtime: string | null;
  readonly current_state_path: string | null;
  readonly current_state_mission_id: string | null;
  readonly reason: string;
  readonly missing_fields: readonly string[];
  readonly blockers: readonly string[];
}

export interface StopGateCheckResult {
  readonly schema: 'sks.stop-gate-check.v1';
  readonly ok: boolean;
  readonly action: StopGateAction;
  readonly route: string | null;
  readonly mission_id: string | null;
  readonly gate_path: string | null;
  readonly normalized_gate?: SksStopGateV1;
  readonly diagnostics: StopGateDiagnostics;
  readonly feedback: string;
}

export interface StopGateResolution {
  readonly root: string;
  readonly route: string | null;
  readonly mission_id: string | null;
  readonly gate_path: string | null;
  readonly gate_schema: string | null;
  readonly gate_raw: Record<string, unknown> | null;
  readonly checked_paths: readonly string[];
  readonly current_state_path: string | null;
  readonly current_state_mission_id: string | null;
  readonly reason: string;
}
