export const NARUTO_PARENT_MODEL = 'gpt-5.6-sol'
export const NARUTO_PARENT_EFFORT = 'max'

export const LUNA_SUBAGENT_MODEL = 'gpt-5.6-luna'
export const TERRA_SUBAGENT_MODEL = 'gpt-5.6-terra'
export const SOL_SUBAGENT_MODEL = 'gpt-5.6-sol'

export const LUNA_SUBAGENT_EFFORT = 'max'
export const TERRA_SUBAGENT_EFFORT = 'medium'
export const DEFAULT_SUBAGENT_EFFORT = 'high'
export const SOL_MAX_SUBAGENT_EFFORT = 'max'

// Compatibility exports retained for research and older callers. New code
// should select a policy profile instead of combining model/effort constants.
export const DEFAULT_SUBAGENT_MODEL = SOL_SUBAGENT_MODEL
export const THINKING_SUBAGENT_MODEL = SOL_SUBAGENT_MODEL
export const SUBAGENT_EFFORT = SOL_MAX_SUBAGENT_EFFORT

export type SubagentModelPolicyId =
  | 'luna_max_mechanical'
  | 'sol_high_implementation'
  | 'sol_max_judgment'
  | 'terra_medium_context_tools'

export type SubagentTaskClass = 'mechanical' | 'implementation' | 'judgment' | 'context_tools'
export type SubagentContextMode = 'short' | 'long'
export type SubagentToolSurface = 'none' | 'computer_use' | 'browser' | 'image_generation'
export type SubagentScopeSize = 'tiny' | 'bounded' | 'large'
export type SubagentKind = 'worker' | 'expert'
export type SubagentModel = typeof LUNA_SUBAGENT_MODEL | typeof TERRA_SUBAGENT_MODEL | typeof SOL_SUBAGENT_MODEL
export type SubagentModelReasoningEffort = 'medium' | 'high' | 'max'

export interface SubagentModelProfile {
  policy: SubagentModelPolicyId
  kind: SubagentKind
  model: SubagentModel
  modelReasoningEffort: SubagentModelReasoningEffort
}

export interface SubagentModelDecision extends SubagentModelProfile {
  reason: SubagentModelPolicyId
}

export const SUBAGENT_MODEL_POLICIES: Readonly<Record<SubagentModelPolicyId, SubagentModelProfile>> = Object.freeze({
  luna_max_mechanical: Object.freeze({
    policy: 'luna_max_mechanical',
    kind: 'worker',
    model: LUNA_SUBAGENT_MODEL,
    modelReasoningEffort: LUNA_SUBAGENT_EFFORT
  }),
  sol_high_implementation: Object.freeze({
    policy: 'sol_high_implementation',
    kind: 'worker',
    model: SOL_SUBAGENT_MODEL,
    modelReasoningEffort: DEFAULT_SUBAGENT_EFFORT
  }),
  sol_max_judgment: Object.freeze({
    policy: 'sol_max_judgment',
    kind: 'expert',
    model: SOL_SUBAGENT_MODEL,
    modelReasoningEffort: SOL_MAX_SUBAGENT_EFFORT
  }),
  terra_medium_context_tools: Object.freeze({
    policy: 'terra_medium_context_tools',
    kind: 'worker',
    model: TERRA_SUBAGENT_MODEL,
    modelReasoningEffort: TERRA_SUBAGENT_EFFORT
  })
})

const JUDGMENT_TASK_RE = new RegExp([
  '\\breview(?:er|ing)?\\b',
  '\\baudit(?:or|ing)?\\b',
  '\\bdebug(?:ger|ging)?\\b',
  'diagnos',
  'investigat',
  '\\bwhy\\b',
  '\\bfail(?:ed|ure|ing)?\\b',
  'root[- ]?cause',
  'strategy',
  '\\bplan(?:ning)?\\b',
  'product',
  'architecture',
  'architect',
  '\\bdesign(?:ing)?\\b',
  'refactor',
  'integrat',
  'conflict',
  'security',
  '\\bauth(?:entication|orization)?\\b',
  '\\bsafety\\b',
  'database',
  '\\bdb\\b',
  'migration',
  'release',
  'publish',
  'deploy',
  'research',
  'hypothesis',
  'falsif',
  'novelty',
  'test[-_ ]?(?:design|strategy|coverage|gap|review)',
  'regression',
  'flaky',
  'ambiguous',
  'ambiguity',
  'trade[- ]?off',
  'quality',
  'judg',
  'assessment',
  '\\bexpert\\b',
  '\\brisk\\b',
  '리뷰',
  '검토',
  '감사',
  '디버깅',
  '진단',
  '조사',
  '원인',
  '전략',
  '기획',
  '계획',
  '설계',
  '아키텍처',
  '리팩터',
  '통합',
  '충돌',
  '보안',
  '인증',
  '안전',
  '데이터베이스',
  '마이그레이션',
  '배포',
  '릴리즈',
  '출시',
  '연구',
  '가설',
  '반증',
  '회귀',
  '모호',
  '트레이드오프',
  '품질',
  '판정',
  '위험'
].join('|'), 'i')

const CONTEXT_TOOL_TASK_RE = new RegExp([
  'computer[- ]?use',
  '\\bbrowser(?:[- ]?use)?\\b',
  '\\bchrome\\b',
  '\\bplaywright\\b',
  '\\bselenium\\b',
  '\\bpuppeteer\\b',
  'image[- ]?(?:gen|generation)',
  '\\bimagegen\\b',
  'gpt[- ]?image',
  '\\bscreenshot(?:ting)?\\b',
  'long[- ]?context',
  'large[- ]?(?:file|document|codebase|repository|context)',
  '(?:repository|repo)[- ]?wide',
  'read[- ]?heavy',
  'supporting[- ]?documents?',
  'multi[- ]?(?:document|file) scan',
  '\\bexplor(?:e|er|ation)\\b',
  '\\bscan(?:ning)?\\b',
  '\\bextract(?:ion)?\\b',
  '\\binventory\\b',
  'extensive[- ]?logs?',
  '컴퓨터\\s*유즈',
  '브라우저',
  '크롬',
  '이미지\\s*생성',
  '스크린샷',
  '롱\\s*컨텍스트',
  '긴\\s*컨텍스트',
  '장문',
  '대규모',
  '저장소\\s*전체',
  '여러\\s*(?:문서|파일)',
  '탐색',
  '스캔',
  '추출',
  '인벤토리'
].join('|'), 'i')

const SIMPLE_MECHANICAL_TASK_RE = new RegExp([
  '\\bone[- ]?line\\b',
  '\\bsingle[- ]?file\\b',
  '\\btiny\\b',
  '\\btrivial\\b',
  '\\bmechanical\\b',
  '\\brepeatable\\b',
  '\\bexact(?:ly)?\\b[^\\n]{0,36}\\b(?:rename|copy|replace|format|fixture|change)\\b',
  '\\b(?:typo|spacing|label|copy|format)[-_ ]?(?:only|fix|change)?\\b',
  '\\brename\\b[^\\n]{0,24}\\b(?:symbol|file|label|key|field)\\b',
  '한\\s*줄',
  '단일\\s*파일',
  '아주\\s*(?:작은|단순한?)',
  '극단적으로\\s*단순',
  '기계적',
  '반복적',
  '정확한?[^\\n]{0,24}(?:이름\\s*변경|복사|치환|포맷|수정)',
  '오타',
  '문구',
  '라벨',
  '간격',
  '이름\\s*변경'
].join('|'), 'i')

const IMPLEMENTATION_TASK_RE = new RegExp([
  '\\bimplement(?:ation|er|ing)?\\b',
  '\\bbuild(?:ing)?\\b',
  '\\bcreate\\b',
  '\\badd\\b[^\\n]{0,40}\\b(?:feature|endpoint|component|modal|button|handler|parser)\\b',
  '\\bmodify\\b',
  '\\bfix\\b',
  '\\bcod(?:e|ing)\\b',
  '\\bui\\b',
  '\\bux\\b',
  '\\bgui\\b',
  'frontend',
  'backend',
  '\\blogic\\b',
  '\\bparser\\b',
  '\\bcomponent\\b',
  '\\bmodal\\b',
  '\\bappkit\\b',
  '\\bswift\\b',
  '\\bfeature\\b',
  '구현',
  '기능\\s*추가',
  '코딩',
  '코드',
  '로직',
  '화면',
  '유아이',
  '유엑스',
  '프론트엔드',
  '백엔드',
  '컴포넌트',
  '모달',
  '버튼',
  '앱킷',
  '스위프트'
].join('|'), 'i')

export function subagentModelProfile(policy: SubagentModelPolicyId): SubagentModelProfile {
  return SUBAGENT_MODEL_POLICIES[policy]
}

export function decideSubagentModel(input: {
  title?: string | undefined
  description?: string | undefined
  role?: string | undefined
  expectedOutput?: string | undefined
  requiresJudgment?: boolean | undefined
  longContext?: boolean | undefined
  toolHeavy?: boolean | undefined
  simpleMechanical?: boolean | undefined
  taskClass?: SubagentTaskClass | undefined
  contextMode?: SubagentContextMode | undefined
  toolSurface?: SubagentToolSurface | undefined
  scopeSize?: SubagentScopeSize | undefined
} = {}): SubagentModelDecision {
  const text = [
    input.title,
    input.description,
    input.role,
    input.expectedOutput
  ].filter(Boolean).join(' ')

  const judgment = input.requiresJudgment === true
    || input.taskClass === 'judgment'
    || JUDGMENT_TASK_RE.test(text)
  if (judgment) return decision('sol_max_judgment')

  const contextOrTools = input.longContext === true
    || input.toolHeavy === true
    || input.taskClass === 'context_tools'
    || input.contextMode === 'long'
    || (input.toolSurface !== undefined && input.toolSurface !== 'none')
    || input.scopeSize === 'large'
    || CONTEXT_TOOL_TASK_RE.test(text)
  if (contextOrTools) return decision('terra_medium_context_tools')

  const simpleMechanical = input.simpleMechanical === true
    || input.taskClass === 'mechanical'
    || input.scopeSize === 'tiny'
    || SIMPLE_MECHANICAL_TASK_RE.test(text)
  if (simpleMechanical) return decision('luna_max_mechanical')

  const implementation = input.taskClass === 'implementation' || IMPLEMENTATION_TASK_RE.test(text)
  if (implementation) return decision('sol_high_implementation')

  // Ambiguous work defaults to the trust-first lane. Sol High is reserved for
  // clearly identified implementation, not for underspecified judgment.
  return decision('sol_max_judgment')
}

export function isReasoningSensitiveSubagentTask(input: Parameters<typeof decideSubagentModel>[0] = {}): boolean {
  return decideSubagentModel(input).policy === 'sol_max_judgment'
}

function decision(policy: SubagentModelPolicyId): SubagentModelDecision {
  return {
    ...subagentModelProfile(policy),
    reason: policy
  }
}
