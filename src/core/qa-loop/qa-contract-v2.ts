import {
  CODEX_APP_SERVER_DOC_URL,
  type QaInteractionSurface
} from '../routes.js';
import { nowIso } from '../fsx.js';
import { inferAuthMode, inferQaTargetKind, selectQaSurfaceForContract } from './qa-surface-router.js';
import {
  DEFAULT_QA_MAX_CYCLES,
  QA_LOOP_CONTRACT_VERSION,
  type QaAuthMode,
  type QaContractV2,
  type QaJourneyGraph,
  type QaJourneyStep,
  type QaTargetKind
} from './qa-types.js';

export interface LegacyQaLoopContract {
  readonly prompt?: string;
  readonly mission_id?: string | null;
  readonly sealed_hash?: string | null;
  readonly answers?: Record<string, unknown>;
}

export interface QaContractV2Options {
  readonly missionId?: string | null;
  readonly requestedSurface?: QaInteractionSurface | 'auto' | null;
  readonly reportOnly?: boolean;
  readonly maxCycles?: number | null;
}

export function buildQaContractV2(
  legacy: LegacyQaLoopContract = {},
  options: QaContractV2Options = {}
): QaContractV2 {
  const answers = legacy.answers || {};
  const prompt = stringValue(legacy.prompt || answers.GOAL_PRECISE || '');
  const targetUrl = normalizeUnset(answers.TARGET_BASE_URL) || firstUrl(prompt) || null;
  const authMode = authModeFromAnswers(answers, prompt);
  const kind = targetKindFromAnswers(answers, prompt, targetUrl, authMode);
  const uiRequired = uiRequiredFromAnswers(answers);
  const apiRequired = apiRequiredFromAnswers(answers);
  const reportOnly = options.reportOnly === true || stringValue(answers.QA_CORRECTIVE_POLICY) === 'report_only_no_code_changes';
  return {
    schema: 'sks.qa-loop-contract.v2',
    version: QA_LOOP_CONTRACT_VERSION,
    generated_at: nowIso(),
    mission_id: options.missionId || legacy.mission_id || null,
    prompt,
    target: {
      url: targetUrl,
      environment: normalizeUnset(answers.TARGET_ENVIRONMENT) || 'local_dev_server',
      kind,
      dev_server_command: normalizeUnset(answers.DEV_SERVER_COMMAND),
      api_base_url: normalizeUnset(answers.API_BASE_URL)
    },
    scope: {
      ui_required: uiRequired,
      api_required: apiRequired,
      visual_required: uiRequired,
      gpt_image_2_review_required: gptImage2RequiredFromAnswers(answers, prompt)
    },
    auth: {
      required: stringValue(answers.LOGIN_REQUIRED) === 'yes' || authMode !== 'not_required',
      mode: authMode,
      credential_storage: 'never_store_credentials_in_artifacts_or_wiki'
    },
    mutation: {
      product_data_policy: productDataPolicyFromAnswers(answers),
      source_code_patch_policy: reportOnly ? 'disabled_report_only' : 'enabled',
      production_side_effects: 'blocked_by_default',
      destructive_deployed_tests: 'never'
    },
    runtime: {
      max_cycles: boundedInteger(options.maxCycles ?? answers.MAX_QA_CYCLES, 1, 50, DEFAULT_QA_MAX_CYCLES),
      no_progress_stop: true,
      convergence_stop: true,
      same_flow_replay_required: true,
      no_headless_only_pass: true,
      no_artifact_only_pass: true,
      no_mock_as_real: true
    },
    cli: {
      report_only: reportOnly,
      requested_surface: options.requestedSurface || surfaceOverrideFromAnswers(answers),
      fix_mode: reportOnly ? 'report_only' : 'safe_local_code_fixes'
    },
    legacy_contract_hash: legacy.sealed_hash || null
  };
}

export function buildQaJourneyGraphV2(contract: QaContractV2): QaJourneyGraph {
  const surface = selectQaSurfaceForContract(contract).selected_surface;
  const steps = journeyStepsForContract(contract, surface);
  return {
    schema: 'sks.qa-loop-journey-graph.v2',
    generated_at: nowIso(),
    mission_id: contract.mission_id,
    surface,
    target: contract.target.url,
    replay_fingerprint: replayFingerprint(contract, steps),
    steps,
    same_flow_replay_required: contract.runtime.same_flow_replay_required
  };
}

export function buildQaAuthDataSandboxPolicy(contract: QaContractV2) {
  return {
    schema: 'sks.qa-loop-auth-data-sandbox-policy.v2',
    generated_at: nowIso(),
    mission_id: contract.mission_id,
    auth: {
      required: contract.auth.required,
      mode: contract.auth.mode,
      credential_storage: contract.auth.credential_storage,
      artifact_redaction: 'credentials_cookies_tokens_sensitive_screenshots_redacted_or_omitted'
    },
    mutation: contract.mutation,
    approvals: {
      source_code_patch: contract.mutation.source_code_patch_policy,
      product_data_mutation: contract.mutation.product_data_policy,
      production_side_effects: contract.mutation.production_side_effects,
      destructive_deployed_tests: contract.mutation.destructive_deployed_tests
    },
    docs_url: CODEX_APP_SERVER_DOC_URL
  };
}

function journeyStepsForContract(contract: QaContractV2, surface: QaInteractionSurface): QaJourneyStep[] {
  const steps: QaJourneyStep[] = [];
  if (contract.scope.ui_required) {
    steps.push({
      id: 'open-target',
      kind: 'open',
      label: `Open target with ${surface}`,
      target: contract.target.url,
      expected: 'target renders without fatal error',
      data_classification: contract.target.kind === 'local_web' ? 'local_fixture' : 'public'
    });
    steps.push({
      id: 'exercise-primary-flow',
      kind: 'click',
      label: 'Exercise the primary user journey with real UI actions',
      target: contract.target.url,
      expected: 'actual state matches the expected journey state',
      data_classification: contract.auth.required ? 'sensitive' : 'public'
    });
    steps.push({
      id: 'assert-visible-state',
      kind: 'assert',
      label: 'Compare expected and observed rendered state',
      target: contract.target.url,
      expected: 'assertions are backed by action and observation ledger entries',
      data_classification: 'public'
    });
  }
  if (contract.scope.api_required) {
    steps.push({
      id: 'api-readiness',
      kind: 'inspect',
      label: 'Inspect safe API readiness and error states',
      target: contract.target.api_base_url || contract.target.url,
      expected: 'API checks stay inside the sandbox policy',
      data_classification: 'public'
    });
  }
  steps.push({
    id: 'fix-and-replay',
    kind: 'replay',
    label: 'Replay exactly the same journey after each applied fix',
    target: contract.target.url,
    expected: 'every applied fix is followed by same-flow replay evidence',
    data_classification: 'source_code'
  });
  return steps;
}

function targetKindFromAnswers(
  answers: Record<string, unknown>,
  prompt: string,
  targetUrl: string | null,
  authMode: QaAuthMode
): QaTargetKind {
  const explicit = stringValue(answers.QA_TARGET_KIND);
  if (isQaTargetKind(explicit)) return explicit as QaTargetKind;
  return inferQaTargetKind({ prompt, targetUrl, authMode });
}

function authModeFromAnswers(answers: Record<string, unknown>, prompt: string): QaAuthMode {
  const explicit = stringValue(answers.QA_AUTH_MODE);
  if (isQaAuthMode(explicit)) return explicit as QaAuthMode;
  if (stringValue(answers.LOGIN_REQUIRED) === 'yes') {
    if (stringValue(answers.TEMP_TEST_CREDENTIALS_READY) === 'yes_temp_only') return 'runtime_ephemeral_credentials';
    return 'blocked_missing_credentials';
  }
  return inferAuthMode(prompt);
}

function productDataPolicyFromAnswers(answers: Record<string, unknown>): QaContractV2['mutation']['product_data_policy'] {
  const policy = stringValue(answers.QA_MUTATION_POLICY);
  if (policy === 'seeded_create_change_remove_local_only') return 'seeded_local_only';
  if (policy === 'seeded_create_change_only') return 'sandbox_only';
  return 'read_only';
}

function surfaceOverrideFromAnswers(answers: Record<string, unknown>): QaInteractionSurface | 'auto' | null {
  const value = stringValue(answers.QA_SURFACE || answers.QA_REQUESTED_SURFACE || answers.REQUESTED_SURFACE);
  if (!value || value === 'auto') return value === 'auto' ? 'auto' : null;
  if (['codex_in_app_browser', 'codex_chrome_extension', 'codex_computer_use', 'codex_app_plugin', 'structured_mcp', 'shell_or_api_diagnostic'].includes(value)) {
    return value as QaInteractionSurface;
  }
  return null;
}

function uiRequiredFromAnswers(answers: Record<string, unknown>): boolean {
  const scope = stringValue(answers.QA_SCOPE || 'ui_e2e_only');
  if (scope === 'api_e2e_only') return false;
  if (scope === 'all_available') return Boolean(normalizeUnset(answers.TARGET_BASE_URL));
  return ['ui_e2e_only', 'ui_and_api_e2e'].includes(scope);
}

function apiRequiredFromAnswers(answers: Record<string, unknown>): boolean {
  const scope = stringValue(answers.QA_SCOPE || 'ui_e2e_only');
  return ['api_e2e_only', 'ui_and_api_e2e', 'all_available'].includes(scope);
}

function gptImage2RequiredFromAnswers(answers: Record<string, unknown>, prompt: string): boolean {
  const explicit = stringValue(answers.QA_VISUAL_REVIEW_IMAGEGEN_REQUIRED || answers.GPT_IMAGE_2_ANNOTATED_REVIEW_REQUIRED);
  if (/^(yes|true|required|yes_gpt_image_2_annotated_review)$/i.test(explicit)) return true;
  if (/^(no|false|not_required|none)$/i.test(explicit)) return false;
  return /(gpt-image-2|gpt\s*image\s*2|imagegen|\$imagegen|annotated\s+review|callout|주석\s*이미지|콜아웃)/i.test(prompt);
}

function replayFingerprint(contract: QaContractV2, steps: readonly QaJourneyStep[]): string {
  return [
    contract.version,
    contract.target.kind,
    contract.target.url || 'no-url',
    contract.auth.mode,
    steps.map((step) => `${step.id}:${step.kind}:${step.target || ''}`).join('|')
  ].join('::');
}

function firstUrl(value: string): string | null {
  return value.match(/https?:\/\/[^\s)\]}>,]+/i)?.[0] || null;
}

function normalizeUnset(value: unknown): string | null {
  const text = stringValue(value);
  if (!text || /^(none|not_required|n\/a|na|unset|same_as_target)$/i.test(text)) return null;
  return text;
}

function stringValue(value: unknown): string {
  return String(value || '').trim();
}

function boundedInteger(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function isQaTargetKind(value: string): boolean {
  return ['local_web', 'public_web', 'signed_in_web', 'native_gui', 'cross_app_gui', 'structured_data', 'api_or_shell'].includes(value);
}

function isQaAuthMode(value: string): boolean {
  return ['not_required', 'runtime_ephemeral_credentials', 'existing_browser_profile', 'blocked_missing_credentials', 'unknown'].includes(value);
}
