import path from 'node:path';
import { exists, nowIso, readJson, readText, writeJsonAtomic, writeTextAtomic, PACKAGE_VERSION } from './fsx.js';
import { CODEX_APP_IMAGE_GENERATION_DOC_URL, CODEX_IMAGEGEN_REQUIRED_POLICY, CODEX_WEB_VERIFICATION_EVIDENCE_SOURCE, CODEX_WEB_VERIFICATION_POLICY, evidenceMentionsForbiddenBrowserAutomation, evidenceMentionsForbiddenWebComputerUseEvidence } from './routes.js';
import { appendAgentLedgerEvent, initializeAgentCentralLedger } from './agents/agent-central-ledger.js';
import { resolveCodexAppExecutionProfile } from './codex-app/codex-app-execution-profile.js';
import { resolveCodexNativeInvocationPlan } from './codex-native/codex-native-invocation-router.js';
import { imageDimensions, sha256File } from './wiki-image/image-hash.js';

export const QA_LOOP_ROUTE = 'QALoop';
export const QA_LOOP_VISUAL_EVIDENCE_ARTIFACT = 'qa-loop/visual-evidence.json';
const QA_REPORT_SUFFIX = 'qa-report.md';
const UI_CHROME_EXTENSION_FIRST_ACK = 'use_codex_chrome_extension_first_no_computer_use_for_web_ui_or_mark_unverified';
const GPT_IMAGE_2_ANNOTATED_REVIEW_REQUIRED_ACK = 'yes_gpt_image_2_annotated_review';
const IMAGE_FILE_RE = /\.(png|jpe?g|webp|gif)$/i;

export const QA_NATIVE_AGENT_PERSONAS = Object.freeze([
  {
    id: 'qa_verifier_ui',
    role: 'verifier',
    label: 'QA UI Verifier',
    read_only: true,
    mandate: 'Verify UI evidence boundaries and report unverified flows without mutating app data.',
    outputs: ['qa-ledger.json', 'qa-report.md']
  },
  {
    id: 'qa_verifier_api',
    role: 'verifier',
    label: 'QA API Verifier',
    read_only: true,
    mandate: 'Verify API smoke evidence with read-only or explicitly seeded-safe requests only.',
    outputs: ['qa-ledger.json']
  },
  {
    id: 'qa_safety',
    role: 'safety',
    label: 'QA Safety Reviewer',
    read_only: true,
    mandate: 'Block destructive deployed tests, credential persistence, and unsupported UI verification claims.',
    outputs: ['qa-gate.json']
  }
]);

export function qaNativeAgentPlan(input: any = {}) {
  const reportFile = input.reportFile || qaReportFilename();
  return {
    schema: 'sks.qa-loop-native-agent-plan.v1',
    backend: 'native_multi_session_agent_kernel',
    legacy_runtime: false,
    central_ledger: 'agents/agent-events.jsonl',
    personas: QA_NATIVE_AGENT_PERSONAS.map((persona: any) => ({
      ...persona,
      session_id: input.missionId ? `${input.missionId}-${persona.id}` : `${persona.id}-session`,
      outputs: (persona.outputs || []).map((artifact: any) => artifact === 'qa-report.md' ? reportFile : artifact)
    })),
    verifier_personas_read_only_by_default: true,
    batches: [
      { id: 'qa-read-only-verification', agents: ['qa_verifier_ui', 'qa_verifier_api'], read_only: true, outputs: ['qa-ledger.json', reportFile] },
      { id: 'qa-safety-review', agents: ['qa_safety'], read_only: true, outputs: ['qa-gate.json'] }
    ]
  };
}

export async function writeQaNativeAgentLedger(dir: any, input: any = {}) {
  const missionId = input.id || input.missionId;
  if (!missionId) return null;
  const plan = qaNativeAgentPlan({ missionId, reportFile: input.reportFile });
  await writeJsonAtomic(path.join(dir, 'qa-agent-plan.json'), plan);
  const root = await initializeAgentCentralLedger(dir, {
    missionId,
    route: '$QA-LOOP',
    prompt: input.prompt || '',
    roster: {
      schema: 'sks.qa-loop-agent-roster.v1',
      mission_id: missionId,
      backend: plan.backend,
      roster: plan.personas.map((persona: any) => ({
        id: persona.id,
        session_id: persona.session_id,
        persona_id: persona.id,
        role: persona.role,
        read_only: persona.read_only,
        output_artifacts: persona.outputs || []
      })),
      personas: plan.personas
    },
    partition: {
      slices: plan.batches.map((batch: any) => ({
        id: batch.id,
        owner_agent_id: batch.agents[0],
        domain: 'qa-loop',
        write_paths: batch.outputs,
        read_only: batch.read_only
      })),
      leases: plan.batches.flatMap((batch: any) => batch.outputs.map((artifact: any) => ({
        path: artifact,
        owner_agent_id: batch.agents[0],
        mode: batch.read_only ? 'read-only-verification' : 'route-local-artifact'
      })))
    }
  });
  for (const batch of plan.batches) {
    const agentId = batch.agents[0] || 'qa_safety';
    await appendAgentLedgerEvent(root, {
      agent_id: agentId,
      session_id: `${missionId}-${agentId}`,
      event_type: 'qa_agent_batch_planned',
      payload: { batch_id: batch.id, read_only: batch.read_only, outputs: batch.outputs }
    });
  }
  return plan;
}

function promptText(prompt: any = '') {
  return String(prompt || '').trim();
}

function lowerPrompt(prompt: any = '') {
  return promptText(prompt).toLowerCase();
}

function qaPromptWantsGptImage2AnnotatedReview(prompt: any = '') {
  return /(gpt-image-2|gpt\s*image\s*2|imagegen|\$imagegen|annotated\s+review|annotated\s+image|callout|generated\s+review\s+image|이미지\s*리뷰|생성\s*이미지|주석\s*이미지|콜아웃)/i.test(promptText(prompt));
}

function firstUrl(prompt: any = '') {
  return promptText(prompt).match(/https?:\/\/[^\s)\]}>,]+/i)?.[0] || '';
}

function qaScopeFromPrompt(prompt: any = '') {
  const lower = lowerPrompt(prompt);
  const wantsUi = /\b(ui|browser|screen|visual)\b|화면|브라우저|시각|첫\s*화면|내비|네비/.test(lower);
  const wantsApi = /\b(api|endpoint|http|request|response)\b|엔드포인트|응답|요청/.test(lower);
  if (wantsUi && wantsApi) return 'ui_and_api_e2e';
  if (wantsApi && !wantsUi) return 'api_e2e_only';
  return 'ui_e2e_only';
}

function targetEnvironmentFromPrompt(prompt: any = '') {
  const lower = lowerPrompt(prompt);
  if (/\b(prod|production|deployed|live)\b|프로덕션|운영|배포된|실서비스/.test(lower)) return 'deployed_production_domain';
  if (/\b(preview|staging|stage)\b|프리뷰|스테이징|스테이지/.test(lower)) return 'preview_or_staging_domain';
  return 'local_dev_server';
}

function loginPolicyFromPrompt(prompt: any = '') {
  const lower = lowerPrompt(prompt);
  const required = /\b(login|log in|signin|sign in|auth|authenticated|credential)\b|로그인|인증|계정/.test(lower);
  if (!required) {
    return {
      LOGIN_REQUIRED: 'no',
      TEMP_TEST_CREDENTIALS_READY: 'not_required',
      TEST_CREDENTIALS_RUNTIME_SOURCE: 'not_required'
    };
  }
  return {
    LOGIN_REQUIRED: 'yes',
    TEMP_TEST_CREDENTIALS_READY: 'no_block_authenticated_tests',
    TEST_CREDENTIALS_RUNTIME_SOURCE: 'not_required'
  };
}

export function inferQaLoopAnswers(prompt: any = '') {
  const text = promptText(prompt);
  const environment = targetEnvironmentFromPrompt(text);
  const url = firstUrl(text);
  const local = environment === 'local_dev_server';
  const login = loginPolicyFromPrompt(text);
  const scope = qaScopeFromPrompt(text);
  const wantsGptImage2Review = isUiScope(scope) && qaPromptWantsGptImage2AnnotatedReview(text);
  const acceptance = [
    '앱 첫 화면 또는 지정된 대상이 정상 로드된다.',
    '주요 내비게이션과 핵심 화면 진입에서 콘솔/화면상 치명 오류가 없다.',
    '검증하지 못한 UI/API 범위는 통과로 주장하지 않고 QA 리포트에 남긴다.'
  ];
  if (isUiScope(scope)) acceptance.push('UI E2E 통과 증거는 실제 Codex Chrome Extension screenshot artifact path와 sha256을 기록해야 한다.');
  if (wantsGptImage2Review) acceptance.push('gpt-image-2 annotated review image가 필요한 경우 실제 Codex App $imagegen/gpt-image-2 출력 파일 path, sha256, model, provider를 기록해야 한다.');
  return {
    GOAL_PRECISE: text ? `현재 요청 범위에서 QA-LOOP를 안전하게 실행한다: ${text}` : '현재 로컬 개발 환경에서 핵심 사용자 흐름을 안전하게 QA한다.',
    QA_SCOPE: scope,
    TARGET_ENVIRONMENT: environment,
    TARGET_BASE_URL: url || (local ? 'http://localhost:3000' : 'unset_target_url'),
    DEV_SERVER_COMMAND: local ? 'npm run dev' : 'none',
    API_BASE_URL: 'same_as_target',
    QA_MUTATION_POLICY: 'read_only_smoke_only',
    DESTRUCTIVE_DEPLOYED_TESTS_ALLOWED: 'never',
    EXTERNAL_SIDE_EFFECT_POLICY: 'block_all_external_side_effects',
    ...login,
    CREDENTIAL_STORAGE_ACK: 'never_store_credentials_in_artifacts_or_wiki',
    UI_CHROME_EXTENSION_ACK: UI_CHROME_EXTENSION_FIRST_ACK,
    QA_VISUAL_REVIEW_IMAGEGEN_REQUIRED: wantsGptImage2Review ? GPT_IMAGE_2_ANNOTATED_REVIEW_REQUIRED_ACK : 'not_required',
    TEAM_MODE_ALLOWED: 'no_parent_only',
    MAX_QA_CYCLES: '1',
    ACCEPTANCE_CRITERIA: acceptance,
    NON_GOALS: [
      '결제, 실제 이메일/SMS 발송, 관리자 권한 변경, 데이터 삭제, 프로덕션 데이터 변경은 테스트하지 않는다.'
    ],
    RISK_BOUNDARY: [
      '실제 사용자 데이터, 인증 권한, 결제, 메시지 발송, 웹훅, 외부 서비스 상태를 생성/수정/삭제하지 않는다.',
      'Codex Chrome Extension readiness/evidence가 없으면 web/browser UI 검증 완료로 주장하지 않는다.',
      '로그인이 필요하지만 임시 테스트 자격증명이 없으면 인증 구간은 차단/미검증으로 기록한다.'
    ],
    MID_RUN_UNKNOWN_POLICY: ['preserve_existing_behavior', 'defer_optional_scope', 'block_only_if_no_safe_path']
  };
}

function qaReportDateStamp(date: any = new Date()) {
  return date.toISOString().slice(0, 10);
}

function sanitizeVersion(version: any = PACKAGE_VERSION) {
  return String(version || PACKAGE_VERSION).replace(/^v/i, '').replace(/[^0-9A-Za-z.-]/g, '_');
}

export function qaReportFilename(date: any = new Date(), version: any = PACKAGE_VERSION) {
  return `${qaReportDateStamp(date)}-v${sanitizeVersion(version)}-${QA_REPORT_SUFFIX}`;
}

export function isQaReportFilename(name: any = '') {
  return /^\d{4}-\d{2}-\d{2}-v[0-9A-Za-z][0-9A-Za-z.-]*-qa-report\.md$/.test(String(name || ''));
}

function qaReportFileFromGate(gate: any = {}) {
  return String(gate?.qa_report_file || '').trim();
}

export function buildQaLoopQuestionSchema(prompt: any) {
  const inferred = inferQaLoopAnswers(prompt);
  return {
    schema_version: 1,
    route: QA_LOOP_ROUTE,
    description: `QA-LOOP defaults are inferred from the prompt, TriWiki/current-code defaults, and conservative safety policy. Login secrets and browser auth state are runtime-only and must not be saved to mission files or TriWiki. ${CODEX_WEB_VERIFICATION_POLICY}`,
    prompt,
    inferred_answers: inferred,
    inference_notes: {
      QA_SCOPE: 'prompt-and-safe-default',
      TARGET_ENVIRONMENT: 'prompt-or-local-dev-default',
      TARGET_BASE_URL: 'prompt-url-or-localhost-default',
      QA_MUTATION_POLICY: 'safe-read-only-default',
      LOGIN_REQUIRED: 'prompt-derived; authenticated paths are blocked if no temp credentials are ready'
    },
    slots: []
  };
}

export function qaLoopQuestionSlots() {
  return [
      { id: 'GOAL_PRECISE', question: 'Define the QA objective in one sentence.', required: true, type: 'string' },
      { id: 'QA_SCOPE', question: 'Which QA surface should run?', required: true, type: 'enum', options: ['ui_e2e_only', 'api_e2e_only', 'ui_and_api_e2e', 'all_available'] },
      { id: 'TARGET_ENVIRONMENT', question: 'Where should QA run?', required: true, type: 'enum', options: ['local_dev_server', 'preview_or_staging_domain', 'deployed_production_domain'] },
      { id: 'TARGET_BASE_URL', question: 'What base URL should QA target?', required: true, type: 'string' },
      { id: 'DEV_SERVER_COMMAND', question: 'If local dev is selected, what command starts the app? Use none if already running.', required: true, type: 'string' },
      { id: 'API_BASE_URL', question: 'If API E2E is selected, what API base URL should be used? Use same_as_target when identical.', required: true, type: 'string' },
      { id: 'QA_MUTATION_POLICY', question: 'May QA create or change seeded data?', required: true, type: 'enum', options: ['read_only_smoke_only', 'seeded_create_change_only', 'seeded_create_change_remove_local_only'] },
      { id: 'DESTRUCTIVE_DEPLOYED_TESTS_ALLOWED', question: 'Can non-local QA run destructive removal scenarios?', required: true, type: 'enum', options: ['never'] },
      { id: 'EXTERNAL_SIDE_EFFECT_POLICY', question: 'How should email, SMS, webhook, payment, and admin side effects be handled?', required: true, type: 'enum', options: ['block_all_external_side_effects', 'mock_or_sandbox_only'] },
      { id: 'LOGIN_REQUIRED', question: 'Does UI/API QA require login?', required: true, type: 'enum', options: ['no', 'yes'] },
      { id: 'TEMP_TEST_CREDENTIALS_READY', question: 'If login is required, are test-only credentials ready to provide ephemerally during the run?', required: true, type: 'enum', options: ['not_required', 'yes_temp_only', 'no_block_authenticated_tests'] },
      { id: 'TEST_CREDENTIALS_RUNTIME_SOURCE', question: 'If login is required, how will test-only credentials be provided without saving the values?', required: true, type: 'enum', options: ['not_required', 'ephemeral_chat_only', 'environment_variables', 'secret_manager'] },
      { id: 'CREDENTIAL_STORAGE_ACK', question: 'Acknowledge credential handling policy.', required: true, type: 'enum', options: ['never_store_credentials_in_artifacts_or_wiki'] },
      { id: 'UI_CHROME_EXTENSION_ACK', question: 'Acknowledge UI E2E evidence policy: Codex Chrome Extension first for web/browser/webapp verification; no Computer Use or unofficial browser automation substitute.', required: true, type: 'enum', options: [UI_CHROME_EXTENSION_FIRST_ACK] },
      { id: 'TEAM_MODE_ALLOWED', question: 'May QA-LOOP use Team/subagents where useful?', required: true, type: 'enum', options: ['yes_parallel_where_safe', 'no_parent_only'] },
      { id: 'MAX_QA_CYCLES', question: 'How many no-question QA cycles are allowed before pausing?', required: true, type: 'string' },
      { id: 'ACCEPTANCE_CRITERIA', question: 'List the QA completion criteria.', required: true, type: 'array_or_string' },
      { id: 'NON_GOALS', question: 'List anything QA-LOOP must not test.', required: true, type: 'array_or_string', allow_empty: true },
      { id: 'RISK_BOUNDARY', question: 'List hard safety boundaries for data, auth, permissions, money, messages, and third-party systems.', required: true, type: 'array_or_string' },
      { id: 'MID_RUN_UNKNOWN_POLICY', question: 'If ambiguity appears during no-question QA, choose the resolution order. This does not authorize unrequested fallback implementation code.', required: true, type: 'array', options: ['preserve_existing_behavior', 'smallest_reversible_change', 'defer_optional_scope', 'block_only_if_no_safe_path'] }
    ];
}

export function validateQaLoopAnswers(schema: any, answers: any = {}) {
  if (schema?.route !== QA_LOOP_ROUTE) return [];
  const errors: any[] = [];
  const env = answers.TARGET_ENVIRONMENT;
  const mutation = answers.QA_MUTATION_POLICY;
  const extra = Object.keys(answers).filter((k: any) => /(password|passwd|token|secret|cookie|storage_state|login_username|login_password)/i.test(k));
  if (extra.length) errors.push({ slot: extra.join(','), error: 'qa_loop_credentials_must_not_be_saved_in_answers_json' });
  if (env !== 'local_dev_server' && mutation === 'seeded_create_change_remove_local_only') errors.push({ slot: 'QA_MUTATION_POLICY', error: 'destructive_removal_tests_are_local_dev_only' });
  if (env === 'deployed_production_domain' && mutation !== 'read_only_smoke_only') errors.push({ slot: 'QA_MUTATION_POLICY', error: 'production_deployed_qa_is_read_only_smoke_only' });
  if (answers.DESTRUCTIVE_DEPLOYED_TESTS_ALLOWED !== 'never') errors.push({ slot: 'DESTRUCTIVE_DEPLOYED_TESTS_ALLOWED', error: 'destructive_deployed_tests_never_allowed' });
  if (isUiScope(answers.QA_SCOPE) && answers.UI_CHROME_EXTENSION_ACK !== UI_CHROME_EXTENSION_FIRST_ACK) errors.push({ slot: 'UI_CHROME_EXTENSION_ACK', error: 'ui_e2e_requires_codex_chrome_extension_first_ack' });
  if (answers.LOGIN_REQUIRED === 'yes' && !['yes_temp_only', 'no_block_authenticated_tests'].includes(answers.TEMP_TEST_CREDENTIALS_READY)) errors.push({ slot: 'TEMP_TEST_CREDENTIALS_READY', error: 'authenticated_tests_require_ephemeral_test_credentials_or_must_be_blocked' });
  if (answers.LOGIN_REQUIRED === 'yes' && answers.TEMP_TEST_CREDENTIALS_READY === 'yes_temp_only' && answers.TEST_CREDENTIALS_RUNTIME_SOURCE === 'not_required') errors.push({ slot: 'TEST_CREDENTIALS_RUNTIME_SOURCE', error: 'credential_runtime_source_required' });
  if (answers.CREDENTIAL_STORAGE_ACK !== 'never_store_credentials_in_artifacts_or_wiki') errors.push({ slot: 'CREDENTIAL_STORAGE_ACK', error: 'credential_temp_only_ack_required' });
  return errors;
}

export function isUiScope(scope: any) {
  return ['ui_e2e_only', 'ui_and_api_e2e', 'all_available'].includes(scope);
}

export function isApiScope(scope: any) {
  return ['api_e2e_only', 'ui_and_api_e2e', 'all_available'].includes(scope);
}

function targetUrl(value: any) {
  const text = String(value || '').trim().toLowerCase();
  return Boolean(text) && !['none', 'not_required', 'n/a', 'na', 'unset'].includes(text);
}

function hasUiTarget(a: any = {}) {
  return targetUrl(a.TARGET_BASE_URL);
}

function hasApiTarget(a: any = {}) {
  const api = String(a.API_BASE_URL || '').trim();
  if (!api || /^same_as_target$/i.test(api)) return hasUiTarget(a);
  return targetUrl(api);
}

export function qaUiRequired(a: any = {}) {
  return a.QA_SCOPE === 'all_available' ? hasUiTarget(a) : isUiScope(a.QA_SCOPE);
}

export function qaApiRequired(a: any = {}) {
  return a.QA_SCOPE === 'all_available' ? hasApiTarget(a) : isApiScope(a.QA_SCOPE);
}

export function qaGptImage2AnnotatedReviewRequired(contractOrAnswers: any = {}, prompt: any = '') {
  const answers = contractOrAnswers?.answers || contractOrAnswers || {};
  if (!qaUiRequired(answers)) return false;
  const explicit = String(answers.QA_VISUAL_REVIEW_IMAGEGEN_REQUIRED || answers.GPT_IMAGE_2_ANNOTATED_REVIEW_REQUIRED || '').trim();
  if (/^(yes|true|required|yes_gpt_image_2_annotated_review)$/i.test(explicit)) return true;
  if (/^(no|false|not_required|none)$/i.test(explicit)) return false;
  return qaPromptWantsGptImage2AnnotatedReview(`${prompt || ''}\n${answers.GOAL_PRECISE || ''}\n${JSON.stringify(answers.ACCEPTANCE_CRITERIA || [])}`);
}

export function defaultQaGate(contract: any = {}, opts: any = {}) {
  const a = contract.answers || {};
  const uiRequired = qaUiRequired(a);
  const apiRequired = qaApiRequired(a);
  const gptImage2ReviewRequired = qaGptImage2AnnotatedReviewRequired(contract, contract.prompt);
  const reportFile = opts.reportFile || qaReportFilename();
  const corrective = a.QA_CORRECTIVE_POLICY !== 'report_only_no_code_changes';
  return {
    passed: false,
    clarification_contract_sealed: Boolean(contract.sealed_hash),
    qa_report_written: false,
    qa_report_file: reportFile,
    qa_ledger_complete: false,
    checklist_completed: false,
    safety_reviewed: false,
    deployed_destructive_tests_blocked: a.TARGET_ENVIRONMENT === 'local_dev_server' || a.DESTRUCTIVE_DEPLOYED_TESTS_ALLOWED === 'never',
    credentials_not_persisted: false,
    ui_e2e_required: uiRequired,
    chrome_extension_preflight_passed: !uiRequired,
    ui_chrome_extension_evidence: !uiRequired,
    ui_computer_use_evidence: false,
    ui_evidence_source: uiRequired ? null : 'not_required',
    ui_chrome_extension_screenshot_required: uiRequired,
    ui_chrome_extension_screenshot_captured: !uiRequired,
    ui_chrome_extension_screenshot_artifact: null,
    ui_chrome_extension_screenshot_sha256: null,
    gpt_image_2_annotated_review_required: gptImage2ReviewRequired,
    gpt_image_2_annotated_review_generated: !gptImage2ReviewRequired,
    gpt_image_2_annotated_review_artifact: null,
    gpt_image_2_annotated_review_sha256: null,
    gpt_image_2_annotated_review_model: gptImage2ReviewRequired ? null : 'not_required',
    gpt_image_2_annotated_review_provider: gptImage2ReviewRequired ? null : 'not_required',
    qa_visual_evidence_artifact: QA_LOOP_VISUAL_EVIDENCE_ARTIFACT,
    desktop_app_handoff_required: false,
    desktop_app_handoff_status: 'not_requested',
    desktop_app_handoff_artifact: null,
    desktop_app_handoff_supported: false,
    desktop_app_handoff_confirmed: false,
    desktop_app_handoff_verdict: null,
    desktop_app_handoff_confirmation_artifact: null,
    desktop_app_handoff_is_web_ui_evidence: false,
    image_artifact_path_contract_present: false,
    image_artifact_path_contract_artifact: null,
    image_artifact_path_contract_blockers: [],
    codex_app_execution_profile: opts.executionProfile ? compactExecutionProfile(opts.executionProfile) : null,
    codex_app_execution_profile_artifact: opts.executionProfile ? 'qa-loop/execution-profile.json' : null,
    codex_app_hooks_approval_required: opts.executionProfile?.hooks_approval_required === true,
    codex_app_agent_role_strategy: opts.executionProfile?.agent_role_strategy || null,
    codex_native_invocation: opts.codexNativeInvocation || null,
    api_e2e_required: apiRequired,
    unsafe_external_side_effects: false,
    corrective_loop_enabled: corrective,
    safe_remediation_required: corrective,
    unresolved_findings: 0,
    unresolved_fixable_findings: 0,
    unsafe_or_deferred_findings: 0,
    safe_fix_attempts: 0,
    post_fix_verification_complete: false,
    honest_mode_complete: false,
    evidence: [],
    notes: []
  };
}

export async function writeQaLoopArtifacts(dir: any, mission: any, contract: any) {
  const a = contract.answers || {};
  const checklist = qaChecklist(a);
  const reportFile = qaReportFilename();
  const root = missionRootFromDir(dir);
  const executionProfile = root ? await resolveCodexAppExecutionProfile({ root }).catch(() => null) : null;
  const codexNativeInvocation = root ? await resolveQaCodexNativeInvocation(root, mission.id).catch(() => null) : null;
  if (executionProfile) await writeJsonAtomic(path.join(dir, 'qa-loop', 'execution-profile.json'), executionProfile).catch(() => undefined);
  if (codexNativeInvocation) await writeJsonAtomic(path.join(dir, 'qa-loop', 'codex-native-invocation.json'), codexNativeInvocation).catch(() => undefined);
  await writeJsonAtomic(path.join(dir, 'qa-ledger.json'), {
    schema_version: 1,
    generated_at: nowIso(),
    mission_id: mission.id,
    qa_report_file: reportFile,
    codex_app_execution_profile: executionProfile ? compactExecutionProfile(executionProfile) : null,
    codex_native_invocation: codexNativeInvocation,
    target: { scope: a.QA_SCOPE, environment: a.TARGET_ENVIRONMENT, base_url: a.TARGET_BASE_URL, api_base_url: a.API_BASE_URL },
    safety: { mutation_policy: a.QA_MUTATION_POLICY, deployed_destructive_tests_allowed: 'never', credentials: 'temp_only_never_saved', ui_evidence: 'codex_chrome_extension_first_required_for_web_ui_e2e', visual_review: 'gpt_image_2_annotated_review_required_when_contract_requests_it' },
    checklist
  });
  await writeJsonAtomic(path.join(dir, QA_LOOP_VISUAL_EVIDENCE_ARTIFACT), buildQaLoopVisualEvidenceArtifact(mission, contract));
  await writeJsonAtomic(path.join(dir, 'qa-gate.json'), defaultQaGate(contract, { reportFile, executionProfile, codexNativeInvocation }));
  await writeTextAtomic(path.join(dir, reportFile), qaReportTemplate(mission, contract, checklist));
  return { checklist_count: checklist.length, report_file: reportFile };
}

export async function ensureQaLoopVisualEvidenceContract(dir: any, mission: any = {}, contract: any = {}) {
  const visualPath = path.join(dir, QA_LOOP_VISUAL_EVIDENCE_ARTIFACT);
  if (!(await exists(visualPath))) {
    await writeJsonAtomic(visualPath, buildQaLoopVisualEvidenceArtifact(mission, contract));
  }
  const gatePath = path.join(dir, 'qa-gate.json');
  const gate = await readJson(gatePath, null);
  if (!gate) return;
  const defaults = defaultQaGate(contract, { reportFile: qaReportFileFromGate(gate) || qaReportFilename() });
  const keys = [
    'ui_chrome_extension_screenshot_required',
    'ui_chrome_extension_screenshot_captured',
    'ui_chrome_extension_screenshot_artifact',
    'ui_chrome_extension_screenshot_sha256',
    'gpt_image_2_annotated_review_required',
    'gpt_image_2_annotated_review_generated',
    'gpt_image_2_annotated_review_artifact',
    'gpt_image_2_annotated_review_sha256',
    'gpt_image_2_annotated_review_model',
    'gpt_image_2_annotated_review_provider',
    'qa_visual_evidence_artifact'
  ];
  const next = { ...gate };
  let changed = false;
  for (const key of keys) {
    if (next[key] === undefined) {
      next[key] = (defaults as any)[key];
      changed = true;
    }
  }
  if (changed) await writeJsonAtomic(gatePath, next);
}

export async function evaluateQaGate(dir: any) {
  const gate = await readJson(path.join(dir, 'qa-gate.json'), {});
  const reportFile = qaReportFileFromGate(gate);
  const reasons: any[] = [];
  for (const key of ['clarification_contract_sealed', 'qa_report_written', 'qa_ledger_complete', 'checklist_completed', 'safety_reviewed', 'deployed_destructive_tests_blocked', 'credentials_not_persisted', 'honest_mode_complete']) {
    if (gate[key] !== true) reasons.push(`${key}_missing`);
  }
  if (gate.corrective_loop_enabled === true) {
    if (gate.safe_remediation_required !== true) reasons.push('safe_remediation_required_missing');
    if (gate.post_fix_verification_complete !== true) reasons.push('post_fix_verification_complete_missing');
    if (positiveCount(gate.unresolved_findings)) reasons.push('unresolved_findings_remaining');
    if (positiveCount(gate.unresolved_fixable_findings)) reasons.push('unresolved_fixable_findings_remaining');
  }
  if (gate.unsafe_external_side_effects === true) reasons.push('unsafe_external_side_effects');
  if (gate.ui_e2e_required === true) {
    if (gate.chrome_extension_preflight_passed !== true) reasons.push('chrome_extension_preflight_missing');
    if (gate.ui_chrome_extension_evidence !== true) reasons.push('ui_chrome_extension_evidence_missing');
    if (gate.ui_computer_use_evidence === true) reasons.push('ui_computer_use_evidence_forbidden_for_web');
    if (gate.ui_evidence_source !== CODEX_WEB_VERIFICATION_EVIDENCE_SOURCE) reasons.push('ui_evidence_source_not_codex_chrome_extension');
    if (evidenceMentionsForbiddenBrowserAutomation({ evidence: gate.evidence, notes: gate.notes, ui_evidence_source: gate.ui_evidence_source })) reasons.push('forbidden_browser_automation_evidence');
    if (evidenceMentionsForbiddenWebComputerUseEvidence({ evidence: gate.evidence, ui_evidence_source: gate.ui_evidence_source })) reasons.push('computer_use_web_evidence_forbidden');
    reasons.push(...await missingQaLoopVisualEvidence(dir, gate));
  } else if (gate.gpt_image_2_annotated_review_required === true) {
    reasons.push(...await missingQaLoopVisualEvidence(dir, gate));
  }
  if (gate.desktop_app_handoff_required === true) {
    if (!['pending', 'launched_pending_confirmation', 'completed'].includes(String(gate.desktop_app_handoff_status || ''))) reasons.push('desktop_app_handoff_missing');
    if (gate.desktop_app_handoff_confirmed !== true) reasons.push('desktop_app_handoff_confirmation_missing');
    if (gate.desktop_app_handoff_verdict !== 'pass') reasons.push('desktop_app_handoff_verdict_not_pass');
    if (gate.desktop_app_handoff_status !== 'completed') reasons.push('desktop_app_handoff_not_completed');
    if (gate.desktop_app_handoff_is_web_ui_evidence === true) reasons.push('desktop_app_handoff_misused_as_web_evidence');
  }
  const imageBlockers = Array.isArray(gate.image_artifact_path_contract_blockers) ? gate.image_artifact_path_contract_blockers : [];
  if (imageBlockers.includes('image_generated_file_path_missing')) reasons.push('image_generated_file_path_missing');
  if (!reportFile) reasons.push('qa_report_file_missing');
  else if (!isQaReportFilename(reportFile)) reasons.push('qa_report_filename_prefix_invalid');
  else if (!(await exists(path.join(dir, reportFile)))) reasons.push('qa_report_missing');
  if (!(await exists(path.join(dir, 'qa-ledger.json')))) reasons.push('qa_ledger_missing');
  const uniqueReasons = [...new Set(reasons)];
  const passed = gate.passed === true && uniqueReasons.length === 0;
  const result = { checked_at: nowIso(), passed, reasons: uniqueReasons, gate };
  await writeJsonAtomic(path.join(dir, 'qa-gate.evaluated.json'), result);
  return result;
}

export async function writeMockQaResult(dir: any, mission: any, contract: any) {
  const previousGate = await readJson(path.join(dir, 'qa-gate.json'), {});
  const previousReportFile = qaReportFileFromGate(previousGate);
  const reportFile = isQaReportFilename(previousReportFile) ? previousReportFile : qaReportFilename();
  const uiRequired = qaUiRequired(contract.answers || {});
  await writeTextAtomic(path.join(dir, reportFile), `# QA-LOOP Report\n\nMission: ${mission.id}\nMode: mock verification\n\nMock QA-LOOP completed. No live UI/API actions were executed.\n\n## Honest Mode\n\nThis is a mock smoke run for command verification, not production QA evidence.\n`);
  await writeJsonAtomic(path.join(dir, 'qa-gate.json'), {
    ...defaultQaGate(contract, { reportFile }),
    desktop_app_handoff_required: previousGate.desktop_app_handoff_required === true,
    desktop_app_handoff_status: previousGate.desktop_app_handoff_status || 'not_requested',
    desktop_app_handoff_artifact: previousGate.desktop_app_handoff_artifact || null,
    desktop_app_handoff_supported: previousGate.desktop_app_handoff_supported === true,
    desktop_app_handoff_confirmed: previousGate.desktop_app_handoff_confirmed === true,
    desktop_app_handoff_verdict: previousGate.desktop_app_handoff_verdict || null,
    desktop_app_handoff_confirmation_artifact: previousGate.desktop_app_handoff_confirmation_artifact || null,
    desktop_app_handoff_is_web_ui_evidence: false,
    image_artifact_path_contract_present: previousGate.image_artifact_path_contract_present === true,
    image_artifact_path_contract_artifact: previousGate.image_artifact_path_contract_artifact || null,
    image_artifact_path_contract_blockers: previousGate.image_artifact_path_contract_blockers || [],
    codex_app_execution_profile: previousGate.codex_app_execution_profile || null,
    codex_app_execution_profile_artifact: previousGate.codex_app_execution_profile_artifact || null,
    codex_app_hooks_approval_required: previousGate.codex_app_hooks_approval_required === true,
    codex_app_agent_role_strategy: previousGate.codex_app_agent_role_strategy || null,
    codex_native_invocation: previousGate.codex_native_invocation || null,
    blockers: previousGate.blockers || [],
    passed: !uiRequired,
    qa_report_written: true,
    qa_ledger_complete: true,
    checklist_completed: true,
    safety_reviewed: true,
    credentials_not_persisted: true,
    chrome_extension_preflight_passed: !uiRequired,
    ui_chrome_extension_evidence: !uiRequired,
    ui_computer_use_evidence: false,
    ui_evidence_source: uiRequired ? null : 'not_required',
    unresolved_findings: 0,
    unresolved_fixable_findings: 0,
    unsafe_or_deferred_findings: 0,
    post_fix_verification_complete: true,
    honest_mode_complete: true,
    evidence: ['mock QA-LOOP smoke completed'],
    notes: ['No live UI/API verification was claimed.']
  });
  return evaluateQaGate(dir);
}

async function resolveQaCodexNativeInvocation(root: string, missionId: string) {
  const [visualReview, hookEvidence, imageFollowup] = await Promise.all([
    resolveCodexNativeInvocationPlan({ root, missionId, route: '$QA-LOOP', desiredCapability: 'visual-review' }),
    resolveCodexNativeInvocationPlan({ root, missionId, route: '$QA-LOOP', desiredCapability: 'hook-evidence' }),
    resolveCodexNativeInvocationPlan({ root, missionId, route: '$Image', desiredCapability: 'image-followup' })
  ]);
  return {
    visual_review: visualReview.selected_strategy,
    visual_review_plan: visualReview,
    hook_evidence_policy: hookEvidence.env.SKS_CODEX_NATIVE_HOOK_EVIDENCE_POLICY,
    hook_evidence_plan: hookEvidence,
    image_path_strategy: imageFollowup.selected_strategy === 'codex-app-native' ? 'model-visible-path' : 'artifact-path',
    image_followup_plan: imageFollowup,
    hook_derived_evidence_counted: hookEvidence.selected_strategy !== 'blocked'
  };
}

export function buildQaLoopPrompt({ id, mission, contract, cycle, previous, reportFile, imagePathContract, appHandoff, executionProfile }: any) {
  const report = reportFile && isQaReportFilename(reportFile) ? reportFile : 'the date/version-prefixed report named by qa-gate.json.qa_report_file';
  const imageContractText = imagePathContract
    ? `\nIMAGE PATH CONTRACT:\n${JSON.stringify(imagePathContract, null, 2)}\nUse model_visible_path values for follow-up image edits; do not invent generated image paths.\n`
    : '';
  const appHandoffText = appHandoff
    ? `\nCODEX DESKTOP /app HANDOFF:\n${JSON.stringify(appHandoff, null, 2)}\nThis is desktop-app review status only and is not web UI evidence.\n`
    : '';
  const executionProfileText = executionProfile
    ? `\nCODEX APP EXECUTION PROFILE:\n${JSON.stringify(compactExecutionProfile(executionProfile), null, 2)}\nUse this routing profile for agent role strategy and app/headless assumptions.\n`
    : '';
  return `SKS QA-LOOP
MISSION: ${id}
TASK: ${mission.prompt}
CYCLE: ${cycle}
NO QUESTIONS: use decision-contract.json.
MODE: dogfood as human proxy; use real flows, fix safe code/test/docs now, then recheck.
UI: ${CODEX_WEB_VERIFICATION_POLICY} Secrets runtime-only.
SAFETY: deployed read-only smoke; no destructive, billing, message, webhook, admin, bulk-write, global-config, or live-data edits unless contract allows.
GATE: passed=false while unresolved_findings or unresolved_fixable_findings > 0, or post_fix_verification_complete is not true.
ARTIFACTS: update qa-ledger.json, ${report}, qa-gate.json, and qa-loop/cycle-${cycle}/.
CONTRACT:
${JSON.stringify(contract, null, 2)}
${imageContractText}${appHandoffText}${executionProfileText}
VISUAL EVIDENCE CONTRACT:
- For web UI QA, do not set chrome_extension_preflight_passed/ui_chrome_extension_evidence to true unless the Codex Chrome Extension path is ready and ${QA_LOOP_VISUAL_EVIDENCE_ARTIFACT} records a real saved Chrome Extension screenshot artifact with path, sha256, and dimensions.
- If decision-contract.json answers set QA_VISUAL_REVIEW_IMAGEGEN_REQUIRED=${GPT_IMAGE_2_ANNOTATED_REVIEW_REQUIRED_ACK}, use Codex App $imagegen/gpt-image-2 (${CODEX_APP_IMAGE_GENERATION_DOC_URL}) to produce a real generated annotated review image from the Chrome Extension screenshot. Record its path, sha256, model=gpt-image-2, provider=Codex App $imagegen, and source_screenshot_artifact in ${QA_LOOP_VISUAL_EVIDENCE_ARTIFACT} and qa-gate.json.
- Do not substitute prose-only critique, Playwright/Selenium/Puppeteer/Browser Use screenshots, Computer Use browser screenshots, placeholder images, fake fixtures, or direct API fallback as full web UI visual evidence.
Previous tail:
${String(previous || '').slice(-2500)}
`;
}

export async function qaStatus(dir: any) {
  const mission = await readJson(path.join(dir, 'mission.json'), {});
  const contract = await readJson(path.join(dir, 'decision-contract.json'), { prompt: mission.prompt, answers: {}, sealed_hash: null });
  await ensureQaLoopVisualEvidenceContract(dir, mission, contract).catch(() => undefined);
  const gate = await evaluateQaGate(dir).catch(async () => await readJson(path.join(dir, 'qa-gate.evaluated.json'), await readJson(path.join(dir, 'qa-gate.json'), null)));
  const ledger = await readJson(path.join(dir, 'qa-ledger.json'), null);
  const appHandoff = await readJson(path.join(dir, 'qa-loop', 'app-handoff.json'), null);
  const appConfirmation = await readJson(path.join(dir, 'qa-loop', 'app-handoff-confirmation.json'), null);
  const imagePathContract = await readJson(path.join(dir, 'qa-loop', 'image-artifact-path-contract.json'), null);
  const reportFile = qaReportFileFromGate(gate?.gate || gate || {}) || ledger?.qa_report_file || null;
  const report = reportFile && isQaReportFilename(reportFile) ? await readText(path.join(dir, reportFile), '') : '';
  const executionProfile = await readJson(path.join(dir, 'qa-loop', 'execution-profile.json'), null);
  return { gate, checklist_count: ledger?.checklist?.length ?? null, report_file: reportFile, report_written: Boolean(report.trim()), desktop_app_handoff: appHandoff, desktop_app_confirmation: appConfirmation, desktop_review_complete: appConfirmation?.verdict === 'pass', image_path_contract: imagePathContract, codex_app_execution_profile: executionProfile };
}

function qaChecklist(a: any) {
  const cases = [
    ['preflight.target', 'Confirm target, environment, and mutation policy.'],
    ['preflight.safety', 'Block destructive, billing, messaging, webhook, admin, bulk writes.'],
    ['preflight.corrective_policy', 'Confirm safe fixes plus reverify.'],
    ['preflight.auth', 'Confirm login and temp credential handling.'],
    ['preflight.data', 'Identify seed data, cleanup limits, and rollback expectations.'],
    ['preflight.roles', 'Map roles, permissions, protected areas.']
  ];
  if (qaUiRequired(a)) cases.push(
    ['ui.chrome_extension_first', CODEX_WEB_VERIFICATION_POLICY],
    ['ui.navigation', 'Check primary navigation, deep links, back/forward, refresh, and protected routes.'],
    ['ui.auth', 'Check login, logout, session expiry, unauthorized access, and role-specific visibility.'],
    ['ui.forms', 'Check required fields, validation, disabled states, success, and failure.'],
    ['ui.states', 'Check loading, empty, error, retry, offline/timeout, and slow network states.'],
    ['ui.crud', 'Check allowed create/change flows and block forbidden destructive flows by environment.'],
    ['ui.responsive', 'Check desktop, tablet, mobile, overflow, long text, and keyboard focus order.'],
    ['ui.a11y', 'Check labels, focus traps, modals, contrast-sensitive controls, and screen-reader names.'],
    ['ui.visual', 'Capture evidence for meaningful UI regressions without storing secrets.']
  );
  if (qaApiRequired(a)) cases.push(
    ['api.health', 'Check health/version/readiness endpoints when available.'],
    ['api.auth', 'Check anonymous, authenticated, expired, and wrong-role access.'],
    ['api.contract', 'Check status codes, response shape, headers, content type, and error format.'],
    ['api.validation', 'Check missing, malformed, boundary, duplicate, and over-limit payloads.'],
    ['api.listing', 'Check pagination, sorting, filters, search, and empty results.'],
    ['api.mutation', 'Check allowed seeded create/change and forbid deployed destructive flows.'],
    ['api.idempotency', 'Check retry/idempotency behavior for safe operations.'],
    ['api.concurrency', 'Check stale change, conflict, and double-submit behavior.'],
    ['api.failure', 'Check timeout, upstream error, rate-limit, and rollback-visible failure paths.'],
    ['api.security', 'Check CORS, auth headers, PII redaction, and permission boundaries.']
  );
  cases.push(['report.evidence', 'Record pass/fail/blocked/skipped with evidence.'], ['report.corrective_loop', 'Record fixes, rechecks, unresolved findings, deferred blockers.'], ['report.honest', 'Run Honest Mode.']);
  return cases.map(([id, title]: any) => ({ id, title, status: 'pending', evidence: [] }));
}

export function buildQaLoopVisualEvidenceArtifact(mission: any = {}, contract: any = {}) {
  const answers = contract.answers || {};
  const uiRequired = qaUiRequired(answers);
  const gptImage2ReviewRequired = qaGptImage2AnnotatedReviewRequired(contract, contract.prompt || mission.prompt);
  return {
    schema: 'sks.qa-loop-visual-evidence.v1',
    generated_at: nowIso(),
    mission_id: mission.id || contract.mission_id || null,
    contract_hash: contract.sealed_hash || null,
    required: uiRequired || gptImage2ReviewRequired,
    chrome_extension_screenshot: {
      required: uiRequired,
      status: uiRequired ? 'pending' : 'not_required',
      evidence_source: CODEX_WEB_VERIFICATION_EVIDENCE_SOURCE,
      artifact_path: null,
      sha256: null,
      width: null,
      height: null,
      privacy: 'local-only'
    },
    gpt_image_2_annotated_review: {
      required: gptImage2ReviewRequired,
      status: gptImage2ReviewRequired ? 'pending' : 'not_required',
      model: gptImage2ReviewRequired ? 'gpt-image-2' : 'not_required',
      provider: gptImage2ReviewRequired ? 'Codex App $imagegen' : 'not_required',
      source_screenshot_artifact: null,
      artifact_path: null,
      sha256: null,
      width: null,
      height: null,
      required_output: gptImage2ReviewRequired ? 'generated_annotated_review_image_with_numbered_callouts_severity_labels_and_visual_marks' : 'not_required',
      docs_url: CODEX_APP_IMAGE_GENERATION_DOC_URL,
      privacy: 'local-only'
    },
    blockers: uiRequired ? ['chrome_extension_screenshot_missing'] : [],
    notes: [
      'QA-LOOP web visual evidence must be backed by real saved local image files.',
      CODEX_WEB_VERIFICATION_POLICY,
      CODEX_IMAGEGEN_REQUIRED_POLICY
    ]
  };
}

async function missingQaLoopVisualEvidence(dir: any, gate: any = {}) {
  const visual = await readJson(path.join(dir, QA_LOOP_VISUAL_EVIDENCE_ARTIFACT), null);
  const reasons: string[] = [];
  const uiRequired = gate.ui_e2e_required === true;
  if (uiRequired) {
    const screenshot = visual?.chrome_extension_screenshot || {};
    if (gate.ui_chrome_extension_screenshot_captured !== true && !positiveVisualStatus(screenshot.status, ['captured', 'attached', 'verified'])) reasons.push('ui_chrome_extension_screenshot_missing');
    const screenshotPath = firstNonEmpty(
      gate.ui_chrome_extension_screenshot_artifact,
      gate.chrome_extension_screenshot_artifact,
      gate.ui_chrome_extension_screenshot?.path,
      gate.chrome_extension_screenshot?.path,
      screenshot.artifact_path,
      screenshot.path
    );
    const screenshotSha = firstNonEmpty(
      gate.ui_chrome_extension_screenshot_sha256,
      gate.chrome_extension_screenshot_sha256,
      gate.ui_chrome_extension_screenshot?.sha256,
      gate.chrome_extension_screenshot?.sha256,
      screenshot.sha256
    );
    const screenshotDims = {
      width: firstNonEmpty(gate.ui_chrome_extension_screenshot_width, gate.ui_chrome_extension_screenshot?.width, gate.chrome_extension_screenshot?.width, screenshot.width),
      height: firstNonEmpty(gate.ui_chrome_extension_screenshot_height, gate.ui_chrome_extension_screenshot?.height, gate.chrome_extension_screenshot?.height, screenshot.height)
    };
    if (!screenshotPath) reasons.push('ui_chrome_extension_screenshot_artifact_missing');
    else reasons.push(...await imageEvidenceFileReasons(dir, screenshotPath, screenshotSha, 'ui_chrome_extension_screenshot', screenshotDims));
    const screenshotSource = firstNonEmpty(gate.ui_chrome_extension_screenshot_source, screenshot.evidence_source, gate.ui_evidence_source);
    if (screenshotSource !== CODEX_WEB_VERIFICATION_EVIDENCE_SOURCE) reasons.push('ui_chrome_extension_screenshot_source_not_codex_chrome_extension');
  }

  const review = visual?.gpt_image_2_annotated_review || {};
  const gptImage2ReviewRequired = gate.gpt_image_2_annotated_review_required === true || review.required === true;
  if (gptImage2ReviewRequired) {
    if (gate.gpt_image_2_annotated_review_generated !== true && !positiveVisualStatus(review.status, ['generated', 'attached', 'verified'])) reasons.push('gpt_image_2_annotated_review_image_missing');
    const reviewPath = firstNonEmpty(
      gate.gpt_image_2_annotated_review_artifact,
      gate.imagegen_annotated_review_artifact,
      gate.gpt_image_2_annotated_review?.path,
      gate.gpt_image_2_annotated_review_image?.path,
      review.artifact_path,
      review.path
    );
    const reviewSha = firstNonEmpty(
      gate.gpt_image_2_annotated_review_sha256,
      gate.gpt_image_2_annotated_review?.sha256,
      gate.gpt_image_2_annotated_review_image?.sha256,
      review.sha256
    );
    const reviewDims = {
      width: firstNonEmpty(gate.gpt_image_2_annotated_review_width, gate.gpt_image_2_annotated_review?.width, gate.gpt_image_2_annotated_review_image?.width, review.width),
      height: firstNonEmpty(gate.gpt_image_2_annotated_review_height, gate.gpt_image_2_annotated_review?.height, gate.gpt_image_2_annotated_review_image?.height, review.height)
    };
    if (!reviewPath) reasons.push('gpt_image_2_annotated_review_artifact_missing');
    else reasons.push(...await imageEvidenceFileReasons(dir, reviewPath, reviewSha, 'gpt_image_2_annotated_review', reviewDims));
    const model = firstNonEmpty(gate.gpt_image_2_annotated_review_model, gate.gpt_image_2_annotated_review?.model, gate.gpt_image_2_annotated_review_image?.model, review.model, review.provider?.model);
    if (model !== 'gpt-image-2') reasons.push('gpt_image_2_annotated_review_model_missing');
    const provider = firstNonEmpty(gate.gpt_image_2_annotated_review_provider, gate.gpt_image_2_annotated_review?.provider, gate.gpt_image_2_annotated_review_image?.provider, review.provider, review.provider_surface);
    if (!provider || !/codex\s+app|\$imagegen|codex_app_imagegen/i.test(String(provider))) reasons.push('gpt_image_2_annotated_review_provider_not_codex_app_imagegen');
    if (/mock|fake|fixture|placeholder|text[-_ ]?only|direct\s+api|openai_images_api|responses_image_generation/i.test(String(provider))) reasons.push('gpt_image_2_annotated_review_provider_forbidden');
    const sourceScreenshot = firstNonEmpty(
      gate.gpt_image_2_source_screenshot_artifact,
      gate.gpt_image_2_annotated_review?.source_screenshot_artifact,
      gate.gpt_image_2_annotated_review_image?.source_screenshot_artifact,
      review.source_screenshot_artifact,
      gate.ui_chrome_extension_screenshot_artifact
    );
    if (!sourceScreenshot) reasons.push('gpt_image_2_source_screenshot_artifact_missing');
  }
  return [...new Set(reasons)];
}

function positiveVisualStatus(status: any, accepted: string[]) {
  return accepted.includes(String(status || '').trim().toLowerCase());
}

function firstNonEmpty(...values: any[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value !== 'string') return value;
  }
  return null;
}

async function imageEvidenceFileReasons(dir: any, artifactPath: any, declaredSha: any, prefix: string, declaredDims: any = {}) {
  const reasons: string[] = [];
  const resolved = resolveEvidencePath(dir, artifactPath);
  if (!resolved) return [`${prefix}_artifact_path_invalid`];
  if (!IMAGE_FILE_RE.test(resolved)) reasons.push(`${prefix}_artifact_not_image_file`);
  if (!(await exists(resolved))) return [...reasons, `${prefix}_artifact_file_missing`];
  const sha = await sha256File(resolved).catch(() => null);
  if (!declaredSha) reasons.push(`${prefix}_sha256_missing`);
  else if (sha && String(declaredSha) !== sha) reasons.push(`${prefix}_sha256_mismatch`);
  const dims = await imageDimensions(resolved).catch(() => null);
  const width = Number(dims?.width ?? declaredDims?.width);
  const height = Number(dims?.height ?? declaredDims?.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) reasons.push(`${prefix}_dimensions_missing`);
  return reasons;
}

function resolveEvidencePath(dir: any, artifactPath: any) {
  const value = String(artifactPath || '').trim().replace(/^file:\/\//i, '');
  if (!value || /^https?:\/\//i.test(value)) return null;
  return path.isAbsolute(value) ? value : path.resolve(dir, value);
}

function missionRootFromDir(dir: string): string | null {
  const normalized = path.resolve(String(dir || ''));
  const marker = `${path.sep}.sneakoscope${path.sep}missions${path.sep}`;
  const idx = normalized.indexOf(marker);
  return idx > 0 ? normalized.slice(0, idx) : null;
}

function compactExecutionProfile(profile: any) {
  return profile ? {
    mode: profile.mode || 'unknown',
    agent_role_strategy: profile.agent_role_strategy || 'message-role',
    hooks_approval_required: profile.hooks_approval_required === true,
    hook_approval_state: profile.hook_approval_state || 'unknown',
    app_handoff_ready: profile.app_handoff_ready === true,
    plugin_mcp_inventory_ready: profile.plugin_mcp_inventory_ready === true,
    artifact_path: profile.artifact_path || '.sneakoscope/reports/codex-app-execution-profile.json'
  } : null;
}

function qaReportTemplate(mission: any, contract: any, checklist: any) {
  const a = contract.answers || {};
  return `# QA-LOOP Report\n\nMission: ${mission.id}\nTarget: ${a.TARGET_BASE_URL || 'unset'}\nScope: ${a.QA_SCOPE || 'unset'}\nEnvironment: ${a.TARGET_ENVIRONMENT || 'unset'}\n\n## Safety\n\n- Deployed destructive tests: never\n- Credentials: temp-only, never saved\n- UI evidence: ${CODEX_WEB_VERIFICATION_POLICY}\n- Visual evidence ledger: ${QA_LOOP_VISUAL_EVIDENCE_ARTIFACT}\n\n## Checklist\n\n${checklist.map((item: any) => `- [ ] ${item.id}: ${item.title}`).join('\n')}\n\n## Findings\n\nTBD\n\n## Corrections And Rechecks\n\nTBD\n\n## Honest Mode\n\nTBD\n`;
}

function positiveCount(value: any) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0;
}
