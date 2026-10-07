import { consultJevOptions, decisionRuntimeConfig, type JevOptionsDecision } from '../decisions/integration.js'
import { graphFileDigest, sourceSnapshotDigest } from '../decisions/state.js'
import { buildFastPathOptionQuestions } from '../decisions/questions.js'
import { DESIGN_DEFAULTS, EXECUTION_POLICY_REVISION, MEMORY_POLICY_REVISION, type ExecutionProfile, type MemoryDisposition, type OptionQuestion } from '../decisions/types.js'
import { compileExecutionProfile, executionStageManifestDigest } from '../pipeline-internals/pipeline-stage-builder.js'
import { stableDigest, redactDecisionText } from '../decisions/state.js'
import { openWorkspaceContextIndex } from '../triwiki/context-graph/query/index.js'
import { memoryDispositionPolicy, sensitiveMemoryInput } from '../memory-governor.js'
import { jevPlanCacheKey, memoizeJevPlan, type JevPlanMemo } from '../router/route-cache.js'
import { readImagegenConfig } from '../imagegen/imagegen-config.js'
import { dollarCommand, routePrompt, stripVisibleDecisionAnswerBlocks } from '../routes.js'
import { classifyTaskProfile, IMPLEMENTATION_VERB_RE } from '../runtime/task-profile.js'

/**
 * One Jev call per submitted prompt, made before SKS routes it. In Jev mode it
 * answers, together:
 * - which SKS pipeline fits the prompt (replacing the keyword router when
 *   Jev is confident; explicit `$commands` always win),
 * - whether the work is worth splitting across child agents (single is the
 *   default and the answer whenever Jev is unsure),
 * - the model tier of the turn (the reasoning hint / default child seal),
 * - whether the turn makes an image, when the custom image model mode is on.
 * Jev off, a greeting, or an unconfident answer keeps the deterministic path.
 */

export const JEV_ROUTE_OPTIONS = Object.freeze({
  answer: { routeId: 'Answer', summary: 'Explain, answer a question, review, or discuss. No file changes.' },
  implement: { routeId: 'Naruto', summary: 'Implement, fix, refactor, configure, or otherwise change code or files. The main agent does the work itself unless the parallelism question says it splits.' },
  tiny_fix: { routeId: 'DFix', summary: 'One tiny direct edit: a typo, one string, or one obvious line.' },
  research: { routeId: 'Research', summary: 'Investigate an open question with hypotheses and sources. No code change.' },
  experiment: { routeId: 'AutoResearch', summary: 'Run experiments or benchmarks to improve a measurable metric.' },
  web_search: { routeId: 'SuperSearch', summary: 'Look up current facts, docs, or news on the web. No code change.' },
  qa_loop: { routeId: 'QALoop', summary: 'Run end-to-end QA of an app in a browser and fix what fails.' },
  presentation: { routeId: 'PPT', summary: 'Make a presentation, deck, or slides.' },
  ux_review: { routeId: 'ImageUXReview', summary: 'Review UI/UX from screenshots with generated callout images.' },
  database: { routeId: 'DB', summary: 'Database schema, queries, migrations, or data changes.' },
  computer_use: { routeId: 'ComputerUse', summary: 'Operate native desktop apps on this Mac.' },
  seo: { routeId: 'SEOGEOOptimizer', summary: "Improve a site's search or generative-engine visibility." }
} as const)

export type JevRouteOption = keyof typeof JEV_ROUTE_OPTIONS

const IMAGE_TASK_RE = /\b(images?|pictures?|photos?|illustrations?|icons?|logos?|banners?|posters?|thumbnails?|mockups?|renders?|drawings?|stickers?|wallpapers?|avatars?)\b|이미지|그림|사진|일러스트|아이콘|로고|배너|포스터|썸네일|시안|렌더|스티커|배경화면|아바타/i
const IMAGE_ROUTES = new Set(['PPT', 'ImageUXReview'])

export interface JevTurnPlan {
  decision: JevOptionsDecision
  baselineRouteId: string | null
  routeId: string | null
  routeOverride: { text: string; routeId: string } | null
  customImageModel: string | null
  imageNeeded: boolean | null
  /** Jev judged the work splits into independent parts worth child agents; null when Jev did not decide. */
  parallel: boolean | null
  executionProfile?: ExecutionProfile
  memoryDisposition?: MemoryDisposition
  contextProfile?: 'none' | 'use_first' | 'hydrate_first' | 'deep'
  qaProfile?: 'minimal' | 'reduced_readonly' | 'standard' | 'deep'
  executionPlan?: ReturnType<typeof compileExecutionProfile>
  semanticRoundTrips?: number
  decisionBinding?: JevOptionsDecision['binding']
}

function routeQuestion(): OptionQuestion {
  return {
    id: 'route',
    instructions: 'Choose the SKS pipeline for state.task by what the user wants done, not by keywords. A question about code is answer; a request to change code or files is implement or tiny_fix.',
    options: Object.fromEntries(Object.entries(JEV_ROUTE_OPTIONS).map(([id, row]) => [id, row.summary]))
  }
}

function parallelismQuestion(): OptionQuestion {
  return {
    id: 'parallelism',
    instructions: 'Decide how state.task is executed. Choose single by default: one agent working through it directly is enough for a bug fix, a test, a refactor or config change in one area, a review, and anything whose steps depend on each other, however many steps it takes. Choose parallel only when it splits into two or more independent parts (different files, modules, or packages, no shared edits, no ordering) that would finish clearly faster as separate child agents.',
    options: {
      single: 'One agent does the whole task directly. The right choice unless the work clearly splits.',
      parallel: 'The task splits into two or more independent parts that child agents can do at the same time without touching the same files.'
    }
  }
}

function imageQuestion(): OptionQuestion {
  return {
    id: 'image_need',
    instructions: 'Will finishing state.task make or edit an image (an illustration, icon, photo, banner, slide visual, UI mockup, or annotated screenshot)?',
    options: {
      yes: 'The task produces or edits at least one image.',
      no: 'The task needs no generated or edited image.'
    }
  }
}

function contextQuestion(): OptionQuestion {
  return {
    id: 'context_profile',
    instructions: 'Choose the bounded context profile for state.task. Use the smallest profile that preserves required source evidence; use deep when the graph is stale or the task is ambiguous.',
    options: {
      none: 'No optional context is needed.',
      use_first: 'Use the existing bounded code graph attention first.',
      hydrate_first: 'Hydrate only bounded provenance-backed excerpts before execution.',
      deep: 'Use the full existing context and verification path.'
    }
  };
}

function qaQuestion(): OptionQuestion {
  return {
    id: 'qa_profile',
    instructions: 'Choose the verification depth for state.task. Required safety, schema, permission, and final checks always remain code-owned.',
    options: {
      minimal: 'One focused check for a low-risk read-only task.',
      reduced_readonly: 'Bounded checks for independent read-only work.',
      standard: 'The normal route verification budget.',
      deep: 'Full verification for high-risk, ambiguous, stale, or mutation work.'
    }
  };
}

function memoryCue(prompt: string): boolean {
  return /\b(remember|save|store|preference|policy|forget|wrong|regress|evidence|visual|screenshot|memory|avoid)\b|기억|저장|선호|정책|잊|오류|회귀|증거|시각|스크린샷|메모리|피해/i.test(prompt);
}

function sensitiveCue(prompt: string): boolean {
  return /\b(password|passwd|secret|credential|token|api[ _-]?key|private key|bearer|session id|ssn|social security|credit card)\b|비밀번호|자격증명|토큰|개인키|세션.?id|주민번호|카드번호/i.test(prompt);
}

function mutationRequested(prompt: string): boolean {
  const profile = classifyTaskProfile(prompt)
  if (profile === 'tiny-change' || profile === 'parallel-write' || profile === 'high-risk') return true
  return /\b(?:fix|implement|change|edit|add|remove|delete|modify|refactor|build|create|write|update|rename|rewrite|patch|apply|execute|repair|publish|release|deploy|migrate)\b|수정|변경|추가|삭제|제거|구현|작성|생성|업데이트|적용|실행|해결|이름\s*변경|배포|출시|마이그레이션/i.test(prompt)
    || IMPLEMENTATION_VERB_RE.test(prompt)
}

export async function planJevTurn(root: string, rawPrompt: string, env: NodeJS.ProcessEnv = process.env, context: {
  missionId?: string | null;
  sourceDigest?: string | null;
  graphDigest?: string | null;
  candidateDigest?: string | null;
  turnId?: string | null;
  sourceFresh?: boolean;
  graphFresh?: boolean;
} = {}): Promise<JevTurnPlan | null> {
  const prompt = stripVisibleDecisionAnswerBlocks(rawPrompt).trim()
  if (!prompt || classifyTaskProfile(prompt) === 'passthrough') return null
  const explicit = Boolean(dollarCommand(prompt)) || /^\$?plan\b/i.test(prompt)
  const baselineRouteId = explicit ? null : routePrompt(prompt)?.id || null
  const imagegen = await readImagegenConfig(env).catch(() => null)
  const customImageModel = imagegen?.mode === 'openrouter' ? imagegen.openrouter_model : null
  const config = await decisionRuntimeConfig(env)
  const sensitive = sensitiveCue(prompt) || sensitiveMemoryInput(prompt)
  const destructive = /\b(?:delete|drop|truncate|destroy|publish|deploy|promote|forget)\b|삭제|잊어|배포|승격/i.test(prompt)
  const exact = /^(?:where (?:is|are)|show|read|open)\s+(?:[\w.-]+\/)+[\w.-]+\s*\??$/i.test(prompt)
  const prefilterReason = sensitive ? 'privacy_unavailable' : explicit ? 'explicit_command'
    : destructive ? 'destructive_prefilter' : exact ? 'exact_lookup' : config.mode !== 'jev' || !config.consentCloud ? 'off' : null
  const memoryEligible = Boolean(context.missionId) && !prefilterReason && config.memoryIntake === true
    && memoryCue(prompt) && !['Answer', 'DFix', 'Help'].includes(String(baselineRouteId || ''))
  // Off and cheap deterministic paths never pay for a graph/source scan.
  const sourceDigest = prefilterReason ? null : context.sourceDigest || await sourceSnapshotDigest(root).catch(() => null)
  const graphDigest = prefilterReason ? null : context.graphDigest === undefined ? await graphFileDigest(root).catch(() => null) : context.graphDigest
  const sourceFresh = Boolean(sourceDigest) && context.sourceFresh !== false
  const graphFresh = Boolean(graphDigest) && (context.graphFresh === undefined
    ? await openWorkspaceContextIndex(root).then(handle => handle.fresh).catch(() => false)
    : context.graphFresh === true)
  const candidateDigest = context.candidateDigest || stableDigest(redactDecisionText(prompt, 1200))
  const configDigest = stableDigest({ ...config, customImageModel, model: DESIGN_DEFAULTS.model })
  const questions: OptionQuestion[] = [routeQuestion(), parallelismQuestion(), contextQuestion(), qaQuestion(), ...buildFastPathOptionQuestions({ includeProfile: true, includeMemory: memoryEligible })]
  if (customImageModel) questions.push(imageQuestion())
  const cacheKey = jevPlanCacheKey({
    workflowId: stableDigest({ project: root, mission: context.missionId || null, route: baselineRouteId, explicit, sourceFresh, graphFresh }),
    turnId: context.turnId || null, sourceDigest, graphDigest, candidateDigest,
    stageManifestDigest: executionStageManifestDigest(), policyRevision: EXECUTION_POLICY_REVISION,
    memoryPolicyRevision: MEMORY_POLICY_REVISION, configDigest
  })
  const compute = async (): Promise<JevPlanMemo> => {
    const decision: JevOptionsDecision = prefilterReason
      ? { called: false, choices: {}, tier: null, reason: prefilterReason, binding: null, semanticRoundTrips: 0 }
      : await consultJevOptions({
        root, workflowId: context.missionId || 'turn', goal: prompt, questions, tierRoleId: 'turn',
        turnId: context.turnId || null, sourceDigest, graphDigest, candidateDigest,
        stageManifestDigest: executionStageManifestDigest(), memoryPolicyRevision: MEMORY_POLICY_REVISION, configDigest,
        facts: { keyword_router_guess: baselineRouteId, memory_candidate_digest: memoryEligible ? candidateDigest : null, source_fresh: sourceFresh, graph_fresh: graphFresh }, env
      })
    const choice = (decision.choices.route as JevRouteOption | undefined) ?? null
    const routeId = choice && JEV_ROUTE_OPTIONS[choice] ? JEV_ROUTE_OPTIONS[choice].routeId : null
    const policyDisposition = memoryDispositionPolicy({ prompt, missionId: context.missionId || null,
      enabled: memoryEligible && Boolean(decision.binding), choice: decision.choices.memory_disposition ?? null,
      sourceFresh, graphFresh }).disposition
    const memoryDisposition = sensitive ? 'sensitive_no_store' : memoryEligible ? policyDisposition : 'keep_baseline'
    const executionPlan = compileExecutionProfile({
      requestedProfile: decision.choices.execution_profile || 'baseline', policy: config.executionPolicy || 'baseline',
      baselinePlan: baselineRouteId, sourceDigest: sourceDigest || '0'.repeat(64), graphDigest,
      candidateDigest, configDigest, memoryDisposition,
      contextProfile: (decision.choices.context_profile as JevExecutionPlanContext) || 'use_first',
      qaProfile: (decision.choices.qa_profile as JevExecutionPlanQa) || 'standard',
      missionId: context.missionId || null, turnId: context.turnId || null,
      consent: config.mode === 'jev' && config.consentCloud, permission: true,
      mutation: mutationRequested(prompt), destructive,
      parallelEligible: decision.choices.parallelism === 'parallel', enabledProfiles: config.enabledProfiles || [], sourceFresh, graphFresh
    })
    return {
      called: decision.called, reason: decision.reason, semanticRoundTrips: decision.semanticRoundTrips ?? (decision.called ? 1 : 0),
      executionPlan, routeId, baselineRouteId, imageNeeded: decision.choices.image_need === 'yes' ? true : decision.choices.image_need === 'no' ? false : null,
      parallel: decision.choices.parallelism === 'parallel' ? true : decision.choices.parallelism === 'single' ? false : null,
      executionProfile: executionPlan.execution_profile, memoryDisposition,
      contextProfile: executionPlan.context_profile, qaProfile: executionPlan.qa_profile,
      decisionBinding: decision.binding ? { ...decision.binding } : null, tier: decision.tier ? { ...decision.tier } : null
    }
  }
  const { value: memo, cacheHit } = prefilterReason ? { value: await compute(), cacheHit: false }
    : await memoizeJevPlan(cacheKey, compute)
  const decision: JevOptionsDecision = { called: memo.called, choices: {}, tier: memo.tier as JevOptionsDecision['tier'],
    reason: cacheHit ? 'plan_cache_hit' : memo.reason, binding: memo.decisionBinding,
    semanticRoundTrips: cacheHit ? 0 : memo.semanticRoundTrips }
  return { decision, baselineRouteId, routeId: memo.routeId,
    routeOverride: memo.routeId && memo.routeId !== baselineRouteId ? { text: prompt, routeId: memo.routeId } : null,
    customImageModel, imageNeeded: memo.imageNeeded, parallel: memo.parallel,
    executionProfile: memo.executionProfile, memoryDisposition: memo.memoryDisposition,
    contextProfile: memo.contextProfile, qaProfile: memo.qaProfile, executionPlan: memo.executionPlan,
    semanticRoundTrips: decision.semanticRoundTrips || 0, decisionBinding: memo.decisionBinding }
}
type JevExecutionPlanContext = NonNullable<JevTurnPlan['contextProfile']>
type JevExecutionPlanQa = NonNullable<JevTurnPlan['qaProfile']>

/**
 * The custom image model instruction, only on turns that make images: Jev said
 * so, or (without a confident Jev answer) the prompt or route is about images.
 */
export function customImageModeLine(plan: JevTurnPlan | null, rawPrompt: string, routeId: string | null): string {
  if (!plan?.customImageModel) return ''
  const imageTurn = plan.imageNeeded ?? (IMAGE_TASK_RE.test(rawPrompt) || IMAGE_ROUTES.has(String(routeId || '')))
  if (!imageTurn) return ''
  return `SKS image mode: the custom OpenRouter image model ${plan.customImageModel} is on. Make every image with \`sks imagegen generate --prompt <text> --out <file>\` (add \`--reference <file>\` to edit an image); it goes through the SKS Desktop Bridge and writes evidence next to the file. Do not use the built-in image tool this turn.`
}
