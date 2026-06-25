import type { QaInteractionSurface } from '../routes.js';

export const QA_LOOP_CONTRACT_VERSION = 2;
export const DEFAULT_QA_MAX_CYCLES = 5;
export const QA_LOOP_V2_DIR = 'qa-loop';
export const QA_CONTRACT_V2_ARTIFACT = 'qa-loop/qa-contract-v2.json';
export const QA_SURFACE_SELECTION_ARTIFACT = 'qa-loop/qa-surface-selection.json';
export const QA_JOURNEY_GRAPH_ARTIFACT = 'qa-loop/qa-journey-graph.json';
export const QA_ACTION_LEDGER_ARTIFACT = 'qa-loop/action-ledger.jsonl';
export const QA_OBSERVATION_LEDGER_ARTIFACT = 'qa-loop/observation-ledger.jsonl';
export const QA_ASSERTION_LEDGER_ARTIFACT = 'qa-loop/assertion-ledger.jsonl';
export const QA_FINDING_LEDGER_ARTIFACT = 'qa-loop/finding-ledger.jsonl';
export const QA_FIX_LEDGER_ARTIFACT = 'qa-loop/fix-ledger.jsonl';
export const QA_REPLAY_LEDGER_ARTIFACT = 'qa-loop/replay-ledger.jsonl';
export const QA_RUNTIME_EVENT_LEDGER_ARTIFACT = 'qa-loop/runtime-events.jsonl';
export const QA_GATE_V2_ARTIFACT = 'qa-loop/qa-gate-v2.json';
export const QA_LIVE_SESSION_ARTIFACT = 'qa-loop/live-session.json';
export const QA_DEV_SERVER_ARTIFACT = 'qa-loop/dev-server.json';
export const QA_AUTH_DATA_POLICY_ARTIFACT = 'qa-loop/auth-data-sandbox-policy.json';

export type QaTargetKind =
  | 'local_web'
  | 'public_web'
  | 'signed_in_web'
  | 'native_gui'
  | 'cross_app_gui'
  | 'structured_data'
  | 'api_or_shell';

export type QaAuthMode =
  | 'not_required'
  | 'runtime_ephemeral_credentials'
  | 'existing_browser_profile'
  | 'blocked_missing_credentials'
  | 'unknown';

export type QaFixMode = 'safe_local_code_fixes' | 'report_only';
export type QaRunStatus = 'ready' | 'blocked' | 'passed' | 'failed' | 'unverified';

export interface QaContractV2 {
  readonly schema: 'sks.qa-loop-contract.v2';
  readonly version: 2;
  readonly generated_at: string;
  readonly mission_id: string | null;
  readonly prompt: string;
  readonly target: {
    readonly url: string | null;
    readonly environment: string | null;
    readonly kind: QaTargetKind;
    readonly dev_server_command: string | null;
    readonly api_base_url: string | null;
  };
  readonly scope: {
    readonly ui_required: boolean;
    readonly api_required: boolean;
    readonly visual_required: boolean;
    readonly gpt_image_2_review_required: boolean;
  };
  readonly auth: {
    readonly required: boolean;
    readonly mode: QaAuthMode;
    readonly credential_storage: 'never_store_credentials_in_artifacts_or_wiki';
  };
  readonly mutation: {
    readonly product_data_policy: 'read_only' | 'seeded_local_only' | 'sandbox_only';
    readonly source_code_patch_policy: 'enabled' | 'disabled_report_only';
    readonly production_side_effects: 'blocked_by_default';
    readonly destructive_deployed_tests: 'never';
  };
  readonly runtime: {
    readonly max_cycles: number;
    readonly no_progress_stop: boolean;
    readonly convergence_stop: boolean;
    readonly same_flow_replay_required: boolean;
    readonly no_headless_only_pass: boolean;
    readonly no_artifact_only_pass: boolean;
    readonly no_mock_as_real: boolean;
  };
  readonly cli: {
    readonly report_only: boolean;
    readonly requested_surface: QaInteractionSurface | 'auto' | null;
    readonly fix_mode: QaFixMode;
  };
  readonly legacy_contract_hash: string | null;
}

export interface QaSurfaceSelection {
  readonly schema: 'sks.qa-loop-surface-selection.v2';
  readonly selected_at: string;
  readonly mission_id: string | null;
  readonly selected_surface: QaInteractionSurface;
  readonly target_kind: QaTargetKind;
  readonly auth_mode: QaAuthMode;
  readonly ui_required: boolean;
  readonly reason: string;
  readonly docs_url: string;
  readonly alternatives: readonly {
    readonly surface: QaInteractionSurface;
    readonly status: 'selected' | 'not_applicable' | 'blocked_by_policy' | 'fallback_candidate';
    readonly reason: string;
  }[];
  readonly structured_data_first: boolean;
  readonly visual_surface_required: boolean;
}

export interface QaCapabilityPreflight {
  readonly schema: 'sks.qa-loop-capability-preflight.v2';
  readonly checked_at: string;
  readonly ok: boolean;
  readonly selected_surface: QaInteractionSurface;
  readonly status: QaRunStatus;
  readonly blockers: readonly string[];
  readonly unverified: readonly string[];
  readonly details: unknown;
}

export interface QaJourneyStep {
  readonly id: string;
  readonly kind: 'open' | 'click' | 'type' | 'scroll' | 'wait' | 'assert' | 'navigate' | 'inspect' | 'fix' | 'replay';
  readonly label: string;
  readonly target?: string | null;
  readonly expected?: string | null;
  readonly data_classification?: 'public' | 'credential' | 'sensitive' | 'source_code' | 'local_fixture';
}

export interface QaJourneyGraph {
  readonly schema: 'sks.qa-loop-journey-graph.v2';
  readonly generated_at: string;
  readonly mission_id: string | null;
  readonly surface: QaInteractionSurface;
  readonly target: string | null;
  readonly replay_fingerprint: string;
  readonly steps: readonly QaJourneyStep[];
  readonly same_flow_replay_required: boolean;
}

export interface QaLedgerRecord {
  readonly schema: string;
  readonly ts: string;
  readonly mission_id: string | null;
  readonly thread_id?: string | null;
  readonly turn_id?: string | null;
  readonly item_id?: string | null;
  readonly journey_fingerprint?: string | null;
  readonly surface?: QaInteractionSurface | null;
  readonly kind?: string;
  readonly status?: string;
  readonly data?: unknown;
}
