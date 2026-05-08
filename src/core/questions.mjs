import path from 'node:path';
import { writeJsonAtomic, writeTextAtomic } from './fsx.mjs';
import { buildQaLoopQuestionSchema } from './qa-loop.mjs';
import { CODEX_COMPUTER_USE_ONLY_POLICY, FROM_CHAT_IMG_CHECKLIST_ARTIFACT, FROM_CHAT_IMG_COVERAGE_ARTIFACT, FROM_CHAT_IMG_QA_LOOP_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT, hasFromChatImgSignal } from './routes.mjs';

export function buildQuestionSchemaForRoute(route, prompt) {
  if (String(route?.id || '') === 'QALoop') return buildQaLoopQuestionSchema(prompt);
  if (String(route?.id || '') === 'MadSKS') return buildMadSksQuestionSchema(prompt);
  return buildQuestionSchema(prompt);
}

function buildMadSksQuestionSchema(prompt) {
  const task = String(prompt || '').trim() || 'MAD-SKS scoped database override';
  return {
    schema_version: 1,
    description: 'MAD-SKS is explicit-invocation-only. It auto-seals because the dollar command itself is the permission boundary; while active, SKS opens Supabase MCP schema cleanup and direct DB write permissions, leaving only catastrophic database-wipe safeguards.',
    prompt,
    domain_hints: ['db', 'mad-sks'],
    inferred_answers: {
      GOAL_PRECISE: `명시적인 MAD-SKS 호출 범위에서만 DB 권한 조건을 넓혀 작업한다: ${task}`,
      ACCEPTANCE_CRITERIA: [
        '$MAD-SKS is listed in dollar commands and routes to MADSKS mode',
        'Supabase MCP column cleanup, schema cleanup, direct execute SQL, and normal DB writes are allowed only while the active MAD-SKS mission gate remains open',
        'the widened permission is inactive after the MAD-SKS gate is passed or permissions_deactivated is true',
        'whole database/table removal and all-row delete/update operations remain blocked as non-sensible catastrophic operations'
      ],
      NON_GOALS: [],
      PUBLIC_API_CHANGE_ALLOWED: 'yes_if_needed',
      DB_SCHEMA_CHANGE_ALLOWED: 'yes_if_needed',
      DEPENDENCY_CHANGE_ALLOWED: 'no',
      TEST_SCOPE: ['packcheck', 'selftest'],
      MID_RUN_UNKNOWN_POLICY: ['preserve_existing_behavior', 'smallest_reversible_change', 'defer_optional_scope', 'block_only_if_no_safe_path'],
      RISK_BOUNDARY: [
        'MAD-SKS permission widening is explicit-invocation-only',
        'MAD-SKS permission widening does not persist after the active task gate closes',
        'catastrophic database wipe operations remain blocked even in MAD-SKS'
      ],
      MAD_SKS_MODE: 'explicit_invocation_only',
      DATABASE_TARGET_ENVIRONMENT: 'main_branch',
      DATABASE_WRITE_MODE: 'mad_sks_full_mcp_write_for_invocation',
      SUPABASE_MCP_POLICY: 'mad_sks_project_scoped_write_for_invocation',
      DESTRUCTIVE_DB_OPERATIONS_ALLOWED: 'mad_sks_scoped_except_catastrophic_db_wipe',
      DB_BACKUP_OR_BRANCH_REQUIRED: 'recommended_but_not_required_in_mad_sks',
      DB_MAX_BLAST_RADIUS: 'mad_sks_active_invocation_only_catastrophic_wipe_blocked',
      DB_MIGRATION_APPLY_ALLOWED: 'mad_sks_active_invocation_only',
      DB_READ_ONLY_QUERY_LIMIT: '100'
    },
    inference_notes: {
      MAD_SKS_MODE: 'explicit dollar command is the permission boundary',
      DESTRUCTIVE_DB_OPERATIONS_ALLOWED: 'MAD-SKS opens Supabase MCP DB cleanup while blocking only catastrophic database wipe operations'
    },
    slots: []
  };
}

function hasAnswer(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

const AMBIGUITY_READY_THRESHOLD = 0.2;
const CLARITY_FLOORS = {
  goal: 0.75,
  constraints: 0.65,
  success: 0.7,
  context: 0.6
};
const CLARITY_WEIGHTS = {
  goal: 0.35,
  constraints: 0.25,
  success: 0.25,
  context: 0.15
};

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function hasAny(re, text) {
  return re.test(text);
}

function scoreComponent(name, clarity, weight, justification) {
  return {
    name,
    clarity_score: Number(clamp01(clarity).toFixed(2)),
    weight,
    ambiguity_contribution: Number(((1 - clamp01(clarity)) * weight).toFixed(3)),
    justification
  };
}

function summarizeAnswer(value) {
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean).join('; ');
  return String(value || '').trim();
}

function promptedGoalFromAnswers(explicitAnswers = {}) {
  const target = summarizeAnswer(explicitAnswers.INTENT_TARGET);
  const outcome = summarizeAnswer(explicitAnswers.REQUIRED_OUTCOME || explicitAnswers.SUCCESS_CRITERIA_OR_ACCEPTANCE);
  if (target && outcome) return `${target}: ${outcome}`;
  return target || outcome || '';
}

function promptHasExplicitAcceptance(lower) {
  return /완료\s*기준|성공\s*기준|acceptance|criteria|definition of done|검증|테스트|pass|green|확인|완성도|완전히|처음부터|바로\s*보이|노출|표시|end[- ]?to[- ]?end/.test(lower);
}

function promptHasTarget(text, lower) {
  return /[`'"][^`'"]+[`'"]/.test(text)
    || /(?:^|\s)(?:src|bin|scripts|docs|README|CHANGELOG|package\.json|\.sneakoscope|\.agents|\.codex|[A-Za-z0-9_.-]+\/)[^\s,)]*/.test(text)
    || /\$[A-Za-z0-9_-]+/.test(text)
    || /(모호성|질문|파이프라인|게이트|라우트|화면|버튼|모달|디자인|레이아웃|컴포넌트|프론트|리드미|코덱스|결제|로그인|인증|세션|codex|route|pipeline|ambiguity|clarification|question|decision[- ]?contract|hyperplan|prometheus|ouroboros|openagent|payment|billing|auth|session|팀|team|qa|ppt|db|ui|ux|설치|버전|readme|changelog)/.test(lower);
}

function promptHasAction(lower) {
  return /(구현|수정|개선|고쳐|만들|추가|삭제|정리|리팩터|바꿔|교체|재설계|처음부터|알려|보이게|보여|노출|표시|rebuild|rewrite|implement|fix|improve|add|remove|refactor|change|replace|redesign|reverse engineer)/.test(lower);
}

function promptIsUnderspecified(lower) {
  const trimmed = lower.trim();
  return trimmed.length < 12
    || /^(이거|저거|그거|뭔가|문제|고쳐줘|수정해줘|개선해줘|해줘|fix this|improve this|do it)\s*[.!?。]*$/.test(trimmed)
    || /^(이거|저거|그거)\s+(고쳐|수정|개선|해줘)/.test(trimmed);
}

function promptHasRisk(lower) {
  return /(운영|production|prod|live|배포|publish|release|결제|payment|billing|auth|인증|보안|security|db|database|supabase|postgres|sql|schema|migration|마이그레이션|삭제|delete|drop|truncate|reset|권한|permission|credential|secret)/.test(lower);
}

function promptHasContextTarget(text, lower) {
  return promptHasTarget(text, lower)
    || /https?:\/\/\S+/.test(text)
    || /(프로젝트|repo|repository|codebase|코드베이스|현재 코드|current code|기존|existing|local|로컬)/.test(lower);
}

export function buildAmbiguityAssessment(prompt, explicitAnswers = {}) {
  const text = String(prompt || '');
  const lower = text.toLowerCase();
  const target = promptHasTarget(text, lower) || hasAnswer(explicitAnswers.INTENT_TARGET) || hasAnswer(explicitAnswers.GOAL_PRECISE);
  const action = promptHasAction(lower) || hasAnswer(explicitAnswers.REQUIRED_OUTCOME) || hasAnswer(explicitAnswers.GOAL_PRECISE);
  const underspecified = promptIsUnderspecified(lower);
  const acceptance = promptHasExplicitAcceptance(lower) || hasAnswer(explicitAnswers.ACCEPTANCE_CRITERIA) || hasAnswer(explicitAnswers.SUCCESS_CRITERIA_OR_ACCEPTANCE);
  const risk = promptHasRisk(lower);
  const contextTarget = promptHasContextTarget(text, lower) || hasAnswer(explicitAnswers.CODEBASE_CONTEXT_TARGET);
  const predictableSafetyDefault = /(재시도|retry|세션\s*만료|session\s*expired|session\s*expiry|token\s*expired)/.test(lower);
  const hasPolicy = hasAnswer(explicitAnswers.RISK_BOUNDARY) || hasAnswer(explicitAnswers.RISK_AND_BOUNDARY) || predictableSafetyDefault || /(하지\s*마|금지|no\s+|never|묻지|보존|preserve|safe|안전|검증|approval|승인|알아서|판단|추론|infer|default|기본)/.test(lower);
  const hasMultipleChoiceRisk = /(\bor\b|또는|아니면|선택|둘 중|여러|multiple|대안)/.test(lower) && !/(알아서|판단|infer|추론|default|기본)/.test(lower);

  const goalClarity = underspecified ? (target || action ? 0.45 : 0.2) : (target && action ? 0.9 : target || action ? 0.62 : 0.25);
  const constraintClarity = risk ? (hasPolicy ? 0.78 : 0.64) : 0.82;
  const successClarity = acceptance ? 0.86 : (target && action && !risk ? 0.73 : target && action ? 0.66 : 0.38);
  const contextClarity = contextTarget ? 0.82 : (underspecified ? 0.35 : 0.62);
  const components = {
    goal: scoreComponent('goal_clarity', goalClarity, CLARITY_WEIGHTS.goal, target && action ? 'target and action are present' : 'target or action is missing'),
    constraints: scoreComponent('constraint_clarity', constraintClarity, CLARITY_WEIGHTS.constraints, risk ? (hasPolicy ? 'risk cues include a policy boundary' : 'risk cues need a boundary') : 'no high-risk cue detected'),
    success: scoreComponent('success_criteria_clarity', successClarity, CLARITY_WEIGHTS.success, acceptance ? 'success or verification language is explicit' : 'success criteria can be inferred only if goal/risk are clear enough'),
    context: scoreComponent('context_clarity', contextClarity, CLARITY_WEIGHTS.context, contextTarget ? 'target context is named or discoverable' : 'target context is not discoverable from prompt')
  };
  const overall = Object.values(components).reduce((sum, item) => sum + item.ambiguity_contribution, 0);
  const floorFailures = [];
  if (components.goal.clarity_score < CLARITY_FLOORS.goal) floorFailures.push('goal_clarity');
  if (components.constraints.clarity_score < CLARITY_FLOORS.constraints) floorFailures.push('constraint_clarity');
  if (components.success.clarity_score < CLARITY_FLOORS.success) floorFailures.push('success_criteria_clarity');
  if (components.context.clarity_score < CLARITY_FLOORS.context) floorFailures.push('context_clarity');
  const unresolved = [];
  if (components.goal.clarity_score < CLARITY_FLOORS.goal) unresolved.push('intent_target_or_required_outcome');
  if (components.success.clarity_score < CLARITY_FLOORS.success && (!target || !action || risk)) unresolved.push('success_criteria_or_acceptance');
  if (components.constraints.clarity_score < CLARITY_FLOORS.constraints || hasMultipleChoiceRisk) unresolved.push('risk_boundary_or_choice');
  if (components.context.clarity_score < CLARITY_FLOORS.context) unresolved.push('codebase_context_target');
  const uniqueUnresolved = [...new Set(unresolved)];
  return {
    schema_version: 1,
    method: 'weighted_clarity_interview',
    inspired_by: ['ouroboros_ambiguity_threshold', 'prometheus_interview_plan_first', 'hyperplan_adversarial_lenses'],
    threshold: AMBIGUITY_READY_THRESHOLD,
    overall_score: Number(overall.toFixed(3)),
    ready_for_contract: overall <= AMBIGUITY_READY_THRESHOLD && floorFailures.length === 0,
    component_floors_passed: floorFailures.length === 0,
    floor_failures: floorFailures,
    components,
    unresolved_dimensions: uniqueUnresolved,
    question_budget: risk ? 3 : 2,
    adversarial_lenses: ['challenge_framing', 'subtract_unneeded_surface', 'demand_evidence', 'test_integration_risk', 'consider_simpler_alternative']
  };
}

function addInferred(out, notes, id, value, note) {
  if (!hasAnswer(value) && !(Array.isArray(value) && value.length === 0)) return;
  out[id] = value;
  notes[id] = note;
}

function looksLikePresentationArtifactPrompt(lower) {
  const presentationCue = /^\s*\$ppt\b/.test(lower)
    || /\b(ppt|presentation|deck|slide|slides|pitch\s*deck|proposal\s*deck)\b/.test(lower)
    || /발표자료|발표\s*자료|소개자료|제안서|피치덱|슬라이드|pdf\s*자료/.test(lower);
  if (!presentationCue) return false;
  const pipelineMeta = /커맨드|command|route|routing|파이프라인|pipeline|schema|스키마|모호성|ambiguity|질문|게이트|gate/.test(lower);
  return !pipelineMeta || /^\s*\$ppt\b/.test(lower);
}

export function inferAnswersForPrompt(prompt, explicitAnswers = {}) {
  const text = `${prompt || ''}\n${explicitAnswers.GOAL_PRECISE || ''}`;
  const lower = text.toLowerCase();
  const ambiguity = buildAmbiguityAssessment(prompt, explicitAnswers);
  const inferred = {};
  const notes = {};
  const normalizedPrompt = String(prompt || '')
    .replace(/^\s*\$(?:Team|SKS|Goal|team|sks|goal)\b/i, '')
    .replace(/\b(?:executor|reviewer|planner|user)\s*:\s*\d+\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const version = String(text || '').match(/\bv?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\b/)?.[1] || null;
  const versionWork = /버전|version|bump|release|publish:dry|npm\s+pack/.test(lower);
  const installWork = /bootstrap|postinstall|doctor|deps|tmux|homebrew|first install|최초\s*설치|설치\s*ux|셋업|setup/.test(lower);
  const questionGateWork = /모호|ambiguity|clarification|질문|triwiki|추론|infer|predict|예측|answers?\.json|decision-contract/.test(lower);
  const uiuxWork = /\b(ui|modal|screen|button|visual|design|layout|component|prototype|frontend)\b|화면|버튼|모달|디자인|레이아웃|컴포넌트|프론트|시각|발표자료|디자인\s*시스템/.test(lower);
  const presentationWork = looksLikePresentationArtifactPrompt(lower);
  const dbWork = new RegExp(["\\bdb\\b", "database", "schema", "migration", "tab" + "le", "col" + "umn", "rls", "supabase", "postgres", "sql", "테이블", "마이그레이션", "스키마", "컬럼", "열", "행", "데이터베이스"].join("|")).test(lower);
  const dbSchemaWork = new RegExp(["schema", "migration", "migrate", "tab" + "le", "col" + "umn", "rls", "policy", "alt" + "er", "cre" + "ate\\s+tab" + "le", "add\\s+col" + "umn", "remove\\s+col" + "umn", "마이그레이션", "스키마", "테이블", "컬럼", "열", "정책"].join("|")).test(lower);
  const dbReadOnlyTargetWork = /(production|prod|live|운영|프로덕션).*(read|inspect|query|조회|확인)|((read|inspect|query|조회|확인).*(production|prod|live|운영|프로덕션))/.test(lower);
  const dbLocalWork = /\blocal\b|localhost|local_dev|dev\s*db|로컬|개발\s*db/.test(lower);
  const dbPreviewWork = /preview|staging|branch|preview_branch|스테이징|프리뷰|브랜치/.test(lower);
  const dbApplyMigrationWork = /(apply|run|execute|적용|실행).*(migration|migrate|마이그레이션)|((migration|migrate|마이그레이션).*(apply|run|execute|적용|실행))/.test(lower);
  const paymentWork = /결제|payment|billing|invoice|checkout|order/.test(lower);
  const authWork = /로그인|auth|session|token|인증/.test(lower);
  const prioritySignalWork = /화|짜증|답답|;;|!!|강력|기억|우선|자주|반복|카운팅|count|frequency|frequent|priority|weight/.test(lower);
  const cliSurfaceWork = /\b(cli|command|route|usage|help|sks)\b|명령|커맨드|사용법/.test(lower);
  const chatCaptureWork = hasFromChatImgSignal(text)
    && /(chat|conversation|message|messenger|kakao|screenshot|capture|채팅|대화|메신저|카톡|캡처|스크린샷)/i.test(text)
    && /(image|photo|attachment|attached|이미지|사진|첨부)/i.test(text)
    && /(client|customer|request|change|modify|fix|match|ocr|extract|text|고객사|클라이언트|요청|수정|변경|매칭|추출|글자|텍스트)/i.test(text);
  const kind = versionWork ? 'version' : chatCaptureWork ? 'chat_capture' : prioritySignalWork ? 'priority' : questionGateWork ? 'questions' : installWork ? 'install' : null;
  const goals = {
    version: version ? `sneakoscope 버전을 ${version}로 올린다` : 'sneakoscope 버전을 다음 patch 버전으로 올린다',
    chat_capture: 'From-Chat-IMG로 채팅 요구사항과 첨부 원본 이미지를 매칭해 고객사 작업 지시서를 만들고 반영한다',
    priority: '강한 불만과 반복 요청을 TriWiki 우선순위 신호로 기록한다',
    questions: '예측 가능한 답은 추론하고 실제 모호한 항목만 질문한다',
    presentation: '청중과 STP 전략에 맞는 HTML 기반 발표자료/PDF 산출물을 만든다',
    install: 'SKS 최초 설치와 bootstrap을 한 번에 준비 상태까지 연결한다'
  };
  const criteria = {
    version: [version ? `version refs are ${version}` : 'version refs advance consistently', 'publish:dry gate passes', 'npm publish is not run'],
    chat_capture: ['From-Chat-IMG activates chat-image intake only here', 'all visible chat requirements are listed before implementation', `${FROM_CHAT_IMG_COVERAGE_ARTIFACT} maps every customer request, screenshot region, and attachment to work-order item(s)`, `${FROM_CHAT_IMG_CHECKLIST_ARTIFACT} is updated as each request, image match, work item, scoped QA-LOOP, and verification step is completed`, `${FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT} records temporary TriWiki-backed session context with retention metadata`, `${FROM_CHAT_IMG_QA_LOOP_ARTIFACT} proves QA-LOOP ran over the exact customer-request work-order range after implementation`, 'unresolved_items is empty before Team completion', 'scoped_qa_loop_completed is true with zero unresolved QA findings', 'Codex Computer Use visual inspection strengthens matches when available; no Playwright or browser automation substitute is allowed', CODEX_COMPUTER_USE_ONLY_POLICY, 'client requests follow normal SKS gates and verification'],
    priority: ['strong feedback raises required_weight', 'request topics are counted in wiki packs', 'future inference uses priority signals'],
    questions: ['predictable answers are inferred', 'partial answers can seal contracts', 'only unresolved changing slots remain visible'],
    presentation: ['audience profile and STP strategy are explicit before artifact creation', 'target pain points map to proposed solution moments', 'decision context and likely objections are sealed before storyboarding', 'presentation format, device, and delivery context are fixed before design work'],
    install: ['bootstrap/deps initialize readiness', 'missing runtime deps show repair actions', 'readiness output is concrete']
  };
  const explicitPromptedGoal = promptedGoalFromAnswers(explicitAnswers);
  const canInferCoreGoal = explicitPromptedGoal || !ambiguity.unresolved_dimensions.includes('intent_target_or_required_outcome');
  if (!hasAnswer(explicitAnswers.GOAL_PRECISE) && canInferCoreGoal) {
    addInferred(
      inferred,
      notes,
      'GOAL_PRECISE',
      explicitPromptedGoal || (presentationWork ? goals.presentation : (kind ? goals[kind] : (normalizedPrompt ? `사용자 요청을 현재 코드 기준으로 구현한다: ${normalizedPrompt}` : '사용자 요청을 현재 코드 기준으로 구현한다'))),
      explicitPromptedGoal ? 'user-answered-dynamic-intent' : (presentationWork ? 'presentation' : (kind || 'prompt-derived-goal'))
    );
  }
  const explicitAcceptance = explicitAnswers.SUCCESS_CRITERIA_OR_ACCEPTANCE;
  const canInferAcceptance = hasAnswer(explicitAcceptance) || Boolean(kind || presentationWork || paymentWork || authWork) || !ambiguity.unresolved_dimensions.includes('success_criteria_or_acceptance');
  if (!hasAnswer(explicitAnswers.ACCEPTANCE_CRITERIA) && canInferAcceptance) {
    addInferred(
      inferred,
      notes,
      'ACCEPTANCE_CRITERIA',
      hasAnswer(explicitAcceptance) ? explicitAcceptance : (presentationWork ? criteria.presentation : (kind ? criteria[kind] : [
        'requested behavior is implemented in the relevant code path',
        'relevant tests/checks pass or any unavailable check is explicitly justified',
        'final response states what was changed, verified, and left unverified'
      ])),
      hasAnswer(explicitAcceptance) ? 'user-answered-dynamic-acceptance' : (presentationWork ? 'presentation' : (kind || 'default-implementation-criteria'))
    );
  }

  if (explicitAnswers.NON_GOALS === undefined) addInferred(inferred, notes, 'NON_GOALS', [], 'empty non-goals is the safest default when the user did not exclude scope');
  if (!hasAnswer(explicitAnswers.PUBLIC_API_CHANGE_ALLOWED)) addInferred(inferred, notes, 'PUBLIC_API_CHANGE_ALLOWED', cliSurfaceWork || installWork ? 'yes_if_needed' : 'no', 'public-api');
  if (!hasAnswer(explicitAnswers.DEPENDENCY_CHANGE_ALLOWED)) addInferred(inferred, notes, 'DEPENDENCY_CHANGE_ALLOWED', 'no', 'no-new-deps');
  if (!hasAnswer(explicitAnswers.TEST_SCOPE)) {
    const releaseLike = versionWork || installWork || questionGateWork || prioritySignalWork || chatCaptureWork || /\bsneakoscope\b|\bsks\b/.test(lower);
    addInferred(inferred, notes, 'TEST_SCOPE', releaseLike ? ['packcheck', 'selftest', 'sizecheck', 'publish:dry'] : ['focused relevant tests or documented justification'], 'tests');
  }
  if (!hasAnswer(explicitAnswers.MID_RUN_UNKNOWN_POLICY)) {
    addInferred(inferred, notes, 'MID_RUN_UNKNOWN_POLICY', ['preserve_existing_behavior', 'smallest_reversible_change', 'defer_optional_scope', 'block_only_if_no_safe_path'], 'ladder');
  }
  if (!hasAnswer(explicitAnswers.RISK_BOUNDARY)) {
    addInferred(inferred, notes, 'RISK_BOUNDARY', [
      ...(hasAnswer(explicitAnswers.RISK_AND_BOUNDARY) ? [summarizeAnswer(explicitAnswers.RISK_AND_BOUNDARY)] : []),
      'no npm publish unless explicitly requested',
      'do not revert unrelated changes',
      'no destructive commands or live data writes',
      'no unrequested fallback implementation code'
    ], hasAnswer(explicitAnswers.RISK_AND_BOUNDARY) ? 'user-answered-dynamic-risk-boundary' : 'safety');
  }
  if (uiuxWork) {
    if (!hasAnswer(explicitAnswers.UI_STATE_BEHAVIOR)) {
      addInferred(
        inferred,
        notes,
        'UI_STATE_BEHAVIOR',
        'infer_from_task_context_and_existing_design_system; preserve existing loading/error/empty/retry behavior unless explicitly requested; add only standard states required by the touched surface',
        'uiux-inferred-default'
      );
    }
    if (!hasAnswer(explicitAnswers.VISUAL_REGRESSION_REQUIRED)) {
      const visualRequired = /스크린샷\s*필수|시각\s*검증\s*필수|visual\s*regression\s*required|screenshot\s*required/.test(lower);
      addInferred(
        inferred,
        notes,
        'VISUAL_REGRESSION_REQUIRED',
        visualRequired ? 'yes' : 'yes_if_available',
        'uiux-inferred-default'
      );
    }
  }
  if (dbWork) {
    const schemaChangeAllowed = questionGateWork ? 'no' : (dbSchemaWork ? 'yes_if_needed' : 'no');
    const targetEnvironment = dbReadOnlyTargetWork
      ? 'production_read_only'
      : dbLocalWork
        ? 'local_dev'
        : dbPreviewWork
          ? (/supabase/.test(lower) ? 'supabase_branch' : 'preview_branch')
          : 'no_database';
    const migrationApplyAllowed = dbApplyMigrationWork
      ? (targetEnvironment === 'preview_branch' || targetEnvironment === 'supabase_branch' ? 'preview_branch_only' : 'local_only')
      : 'no';
    if (!hasAnswer(explicitAnswers.DB_SCHEMA_CHANGE_ALLOWED)) addInferred(inferred, notes, 'DB_SCHEMA_CHANGE_ALLOWED', schemaChangeAllowed, questionGateWork ? 'question-gate-safe-default' : 'db-intent-default');
    if (!hasAnswer(explicitAnswers.DATABASE_TARGET_ENVIRONMENT)) addInferred(inferred, notes, 'DATABASE_TARGET_ENVIRONMENT', targetEnvironment, 'db-target-inferred');
    if (!hasAnswer(explicitAnswers.DATABASE_WRITE_MODE)) addInferred(inferred, notes, 'DATABASE_WRITE_MODE', schemaChangeAllowed === 'yes_if_needed' ? 'migration_files_only' : 'read_only_only', 'db-write-safe-default');
    if (!hasAnswer(explicitAnswers.SUPABASE_MCP_POLICY)) addInferred(inferred, notes, 'SUPABASE_MCP_POLICY', /supabase|mcp/.test(lower) && targetEnvironment !== 'no_database' ? 'read_only_project_scoped_only' : 'not_used', 'supabase-mcp-safe-default');
    if (!hasAnswer(explicitAnswers['DESTRUCTIVE_' + 'DB_OPERATIONS_ALLOWED'])) addInferred(inferred, notes, 'DESTRUCTIVE_' + 'DB_OPERATIONS_ALLOWED', 'never', 'db-hard-deny-default');
    if (!hasAnswer(explicitAnswers.DB_BACKUP_OR_BRANCH_REQUIRED)) addInferred(inferred, notes, 'DB_BACKUP_OR_BRANCH_REQUIRED', 'yes_for_any_write', 'db-write-guardrail');
    if (!hasAnswer(explicitAnswers.DB_MAX_BLAST_RADIUS)) addInferred(inferred, notes, 'DB_MAX_BLAST_RADIUS', 'no_live_dml', 'db-blast-radius-safe-default');
    if (!hasAnswer(explicitAnswers.DB_MIGRATION_APPLY_ALLOWED)) addInferred(inferred, notes, 'DB_MIGRATION_APPLY_ALLOWED', migrationApplyAllowed, 'migration-apply-safe-default');
    if (!hasAnswer(explicitAnswers.DB_READ_ONLY_QUERY_LIMIT)) addInferred(inferred, notes, 'DB_READ_ONLY_QUERY_LIMIT', '1000', 'read-only-query-limit-default');
  }
  if (paymentWork) {
    if (!hasAnswer(explicitAnswers.PAYMENT_SUCCESS_INVARIANT)) {
      addInferred(
        inferred,
        notes,
        'PAYMENT_SUCCESS_INVARIANT',
        '이미 성공 처리된 결제는 중복 승인, 중복 배송, 중복 포인트 지급, 중복 영수증 발행이 발생하면 안 됩니다. 성공 상태, 결제 금액, 주문 연결은 보존하고 후속 재시도는 멱등 처리합니다.',
        'payment-safe-default'
      );
    }
    if (!hasAnswer(explicitAnswers.PAYMENT_RETRY_POLICY)) {
      addInferred(
        inferred,
        notes,
        'PAYMENT_RETRY_POLICY',
        '일시적 실패만 최대 3회 재시도하고 backoff는 1초, 3초, 10초로 증가시킵니다. 최종 실패 시 failed 상태로 확정하고 재시도 가능한 오류를 보여주며, 이미 성공한 결제는 재시도하지 않습니다.',
        'payment-safe-default'
      );
    }
  }
  if (authWork) {
    if (!hasAnswer(explicitAnswers.AUTH_SESSION_EXPIRED_BEHAVIOR)) {
      addInferred(
        inferred,
        notes,
        'AUTH_SESSION_EXPIRED_BEHAVIOR',
        '세션/토큰 만료 시 API는 401을 반환하고 UI는 로그인 화면으로 이동하되, 가능하면 진행 중이던 작업 맥락과 return path를 보존합니다.',
        'auth-safe-default'
      );
    }
    if (!hasAnswer(explicitAnswers.AUTH_PROTOCOL_CHANGE_ALLOWED)) {
      addInferred(
        inferred,
        notes,
        'AUTH_PROTOCOL_CHANGE_ALLOWED',
        'yes_if_needed',
        'auth-safe-default'
      );
    }
  }
  return { answers: inferred, notes };
}

export function buildQuestionSchema(prompt) {
  const lower = String(prompt || '').toLowerCase();
  const domainHints = [];
  if (/결제|payment|billing|invoice|checkout|order/.test(lower)) domainHints.push('payment');
  if (/로그인|auth|session|token|인증/.test(lower)) domainHints.push('auth');
  if (/\b(ui|modal|screen|button|visual|design|layout|component|prototype|frontend)\b|화면|버튼|모달|디자인|레이아웃|컴포넌트|프론트|시각|발표자료|디자인\s*시스템/.test(lower)) domainHints.push('uiux');
  if (looksLikePresentationArtifactPrompt(lower)) domainHints.push('presentation');
  if (/db|database|schema|migration|테이블|마이그레이션|supabase|postgres|sql/.test(lower)) domainHints.push('db');
  const ambiguity = buildAmbiguityAssessment(prompt);
  const slots = [];
  const presentationSpecific = domainHints.includes('presentation');
  if (!presentationSpecific && ambiguity.unresolved_dimensions.includes('intent_target_or_required_outcome')) {
    slots.push(
      { id: 'INTENT_TARGET', question: '실제로 바꿀 대상과 원하는 결과를 한 문장으로만 적어주세요. 파일/화면/기능명이 있으면 같이 적어주세요.', required: true, type: 'string' }
    );
  }
  if (!presentationSpecific && ambiguity.unresolved_dimensions.includes('success_criteria_or_acceptance')) {
    slots.push(
      { id: 'SUCCESS_CRITERIA_OR_ACCEPTANCE', question: '완료라고 판단할 수 있는 관찰 가능한 기준을 1~3개만 적어주세요. 모르면 “현재 코드 기준으로 판단”이라고 적어도 됩니다.', required: true, type: 'array_or_string' }
    );
  }
  if (ambiguity.unresolved_dimensions.includes('risk_boundary_or_choice')) {
    slots.push(
      { id: 'RISK_AND_BOUNDARY', question: '여러 선택지가 있거나 위험한 변경이 있다면 반드시 지켜야 할 경계만 적어주세요. 없으면 “기존 동작 보존, 파괴적 작업 금지”라고 답해주세요.', required: true, type: 'string' }
    );
  }
  if (ambiguity.unresolved_dimensions.includes('codebase_context_target')) {
    slots.push(
      { id: 'CODEBASE_CONTEXT_TARGET', question: '이 요청이 가리키는 repo/브랜치/화면/파일/최근 오류 맥락을 알려주세요.', required: true, type: 'string' }
    );
  }
  if (domainHints.includes('payment')) {
    const inferred = inferAnswersForPrompt(prompt);
    if (!hasAnswer(inferred.answers.PAYMENT_SUCCESS_INVARIANT)) {
      slots.push({ id: 'PAYMENT_SUCCESS_INVARIANT', question: '이미 성공 처리된 결제에 대해서는 어떤 invariant를 보존해야 하나요?', required: true, type: 'string' });
    }
    if (!hasAnswer(inferred.answers.PAYMENT_RETRY_POLICY)) {
      slots.push({ id: 'PAYMENT_RETRY_POLICY', question: '재시도 횟수, backoff, 실패 최종 상태 정책을 지정해주세요.', required: true, type: 'string' });
    }
  }
  if (domainHints.includes('auth')) {
    const inferred = inferAnswersForPrompt(prompt);
    if (!hasAnswer(inferred.answers.AUTH_SESSION_EXPIRED_BEHAVIOR)) {
      slots.push({ id: 'AUTH_SESSION_EXPIRED_BEHAVIOR', question: '세션/토큰 만료 시 사용자가 보게 될 UX 또는 API 동작을 지정해주세요.', required: true, type: 'string' });
    }
    if (!hasAnswer(inferred.answers.AUTH_PROTOCOL_CHANGE_ALLOWED)) {
      slots.push({ id: 'AUTH_PROTOCOL_CHANGE_ALLOWED', question: '인증 프로토콜 변경을 허용하나요?', required: true, type: 'enum', options: ['no', 'yes_if_needed', 'yes'] });
    }
  }
  if (domainHints.includes('uiux')) {
    slots.push(
      { id: 'UI_STATE_BEHAVIOR', question: '로딩, 에러, 빈 상태, 재시도 등 UI 상태별 기대 동작을 지정해주세요.', required: true, type: 'string' },
      { id: 'VISUAL_REGRESSION_REQUIRED', question: '스크린샷/시각 검증이 필요한가요?', required: true, type: 'enum', options: ['no', 'yes_if_available', 'yes'] }
    );
  }
  if (domainHints.includes('presentation')) {
    slots.push(
      { id: 'PRESENTATION_DELIVERY_CONTEXT', question: '발표자료 사용 환경을 지정해주세요: 세로형 발표자료/모바일 문서/대형 화면 발표/인쇄 PDF 중 무엇인지, 발표 시간과 언어/톤은 무엇인가요?', required: true, type: 'string' },
      { id: 'PRESENTATION_AUDIENCE_PROFILE', question: '누구에게 발표하나요? 의사결정자/실무자/투자자/고객 등 역할, 평균 연령대, 직업/직무/산업, 주제 이해도와 관심도를 적어주세요.', required: true, type: 'string' },
      { id: 'PRESENTATION_STP_STRATEGY', question: 'STP 전략을 적어주세요: Segmentation(청중 세그먼트), Targeting(핵심 타깃), Positioning(그들에게 각인시킬 한 문장 포지션)은 무엇인가요?', required: true, type: 'string' },
      { id: 'PRESENTATION_PAINPOINT_SOLUTION_MAP', question: '타깃의 핵심 페인포인트와 이를 어떻게 해결해 줄 수 있는지 3개 이상 연결해 주세요. 가능하면 각 항목마다 기대되는 아하모먼트도 함께 적어주세요.', required: true, type: 'array_or_string' },
      { id: 'PRESENTATION_DECISION_CONTEXT', question: '발표 후 청중이 승인/구매/이해/실행해야 하는 다음 행동은 무엇이고, 그 결정을 막을 반대논리나 리스크는 무엇인가요?', required: true, type: 'string' }
    );
  }
  if (domainHints.includes('db')) {
    slots.push(
      { id: 'DB_MIGRATION_APPLY_ALLOWED', question: 'migration 적용이 필요할 경우 어디까지 허용하나요?', required: true, type: 'enum', options: ['no', 'local_only', 'preview_branch_only'] },
      { id: 'DB_READ_ONLY_QUERY_LIMIT', question: 'MCP/SQL read-only 조회 시 기본 LIMIT를 몇으로 둘까요?', required: true, type: 'string' }
    );
  }
  const inferred = inferAnswersForPrompt(prompt);
  const inferredSlots = new Set(Object.keys(inferred.answers));
  const askedSlots = slots
    .filter((s) => {
      if (inferredSlots.has(s.id)) return false;
      if (s.id === 'INTENT_TARGET' && hasAnswer(inferred.answers.GOAL_PRECISE)) return false;
      if (s.id === 'SUCCESS_CRITERIA_OR_ACCEPTANCE' && hasAnswer(inferred.answers.ACCEPTANCE_CRITERIA)) return false;
      return true;
    })
    .slice(0, domainHints.includes('presentation') ? slots.length : ambiguity.question_budget);
  return {
    schema_version: 2,
    description: 'SKS scores goal, constraints, success criteria, and codebase context first, then asks only the lowest-clarity questions that can change execution. The rest is inferred from the prompt, TriWiki/current-code defaults, and conservative SKS safety policy. After the contract is sealed, SKS resolves with the decision ladder instead of asking mid-run questions.',
    prompt,
    domain_hints: domainHints,
    ambiguity_assessment: ambiguity,
    inferred_answers: inferred.answers,
    inference_notes: inferred.notes,
    slots: askedSlots
  };
}

export function questionsMarkdown(schema) {
  const lines = [];
  const isQaLoop = schema?.route === 'QALoop';
  lines.push(isQaLoop ? '# Sneakoscope Codex QA-LOOP Prepare Questions' : '# Sneakoscope Codex Ambiguity Questions');
  lines.push('');
  if (isQaLoop) {
    lines.push('QA-LOOP는 이 질문들에 모두 답변하고 Decision Contract가 봉인된 뒤에만 실행됩니다.');
    lines.push('로그인이 필요하면 테스트 전용 계정 정보만 임시 런타임 입력으로 제공해야 하며, answers.json/리포트/로그/wiki에는 절대 저장하지 않습니다.');
    lines.push('UI 수준 E2E와 시각 검증은 Codex Computer Use 증거가 없으면 검증 완료로 주장할 수 없습니다. Chrome MCP, Browser Use, Playwright, Selenium, Puppeteer, 기타 브라우저 자동화는 UI/브라우저 검증 증거로 인정하지 않습니다.');
    lines.push('개발 서버가 아닌 배포/스테이징 도메인에서는 삭제성 테스트를 절대 실행하지 않습니다.');
  } else {
    lines.push('이 질문들에 모두 답변하고 Decision Contract가 봉인된 뒤에만 실행됩니다.');
    lines.push('봉인 후 실행 중에는 사용자에게 새 질문을 하지 않고 decision ladder로 해결합니다.');
    lines.push('사용자 의도가 실제로 모호한 항목만 묻고, 나머지는 TriWiki/current-code 기본값으로 추론합니다.');
  }
  if (schema.description) lines.push(schema.description);
  if (schema.ambiguity_assessment) {
    lines.push('');
    lines.push('## Ambiguity Assessment');
    lines.push('');
    lines.push(`- method: ${schema.ambiguity_assessment.method}`);
    lines.push(`- score: ${schema.ambiguity_assessment.overall_score} (ready threshold <= ${schema.ambiguity_assessment.threshold})`);
    lines.push(`- unresolved dimensions: ${(schema.ambiguity_assessment.unresolved_dimensions || []).join(', ') || 'none'}`);
    lines.push(`- question budget: ${schema.ambiguity_assessment.question_budget}`);
  }
  if (schema.inferred_answers && Object.keys(schema.inferred_answers).length) {
    lines.push('');
    lines.push('## Inferred Answers');
    lines.push('');
    lines.push('These values are prefilled from the prompt, TriWiki/current-code defaults, and conservative SKS safety policy. Override only if they are wrong.');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(schema.inferred_answers, null, 2));
    lines.push('```');
  }
  lines.push('');
  for (let i = 0; i < schema.slots.length; i++) {
    const s = schema.slots[i];
    lines.push(`## ${i + 1}. ${s.id}`);
    lines.push('');
    lines.push(s.question);
    if (s.options) lines.push(`- options: ${s.options.join(', ')}`);
    if (s.examples) lines.push(`- examples: ${s.examples.join(', ')}`);
    lines.push(`- required: ${s.required}`);
    lines.push(`- type: ${s.type}`);
    lines.push('');
  }
  lines.push('## answers.json template');
  lines.push('');
  lines.push('```json');
  const example = {};
  for (const s of schema.slots) {
    if (s.type === 'array' || s.type === 'array_or_string') example[s.id] = s.options ? [s.options[0]] : [];
    else if (s.options) example[s.id] = s.options[0];
    else example[s.id] = s.id === 'DB_MAX_BLAST_RADIUS' ? 'no_live_dml' : '';
  }
  lines.push(JSON.stringify(example, null, 2));
  lines.push('```');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export async function writeQuestions(dir, schema) {
  await writeJsonAtomic(path.join(dir, 'required-answers.schema.json'), schema);
  await writeTextAtomic(path.join(dir, 'questions.md'), questionsMarkdown(schema));
}
