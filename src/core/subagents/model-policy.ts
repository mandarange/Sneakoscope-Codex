export const NARUTO_PARENT_MODEL = 'gpt-5.6-sol'
export const NARUTO_PARENT_EFFORT = 'max'

export const DEFAULT_SUBAGENT_MODEL = 'gpt-5.6-luna'
export const THINKING_SUBAGENT_MODEL = 'gpt-5.6-sol'
export const SUBAGENT_EFFORT = 'max'

export type SubagentKind = 'worker' | 'expert'

export interface SubagentModelDecision {
  kind: SubagentKind
  model: typeof DEFAULT_SUBAGENT_MODEL | typeof THINKING_SUBAGENT_MODEL
  modelReasoningEffort: typeof SUBAGENT_EFFORT
  reason: 'clear_bounded_repeatable_task' | 'reasoning_sensitive_task'
}

const SOL_TASK_RE = new RegExp([
  '\\bui\\b',
  '\\bux\\b',
  '\\bgui\\b',
  'frontend',
  'visual',
  'review',
  'audit',
  'debug',
  'diagnos',
  'investigat',
  '\\bwhy\\b',
  '\\bfail(?:ed|ure|ing)?\\b',
  'root[- ]?cause',
  'strategy',
  '\\bplan\\b',
  'planning',
  'product',
  'architecture',
  'architect',
  'design',
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
  'tests?[-_ ]?(?:fail|failure|debug|diagnos|root[- ]?cause)',
  'failing tests?',
  'flaky',
  'ambiguous',
  'ambiguity',
  'trade[- ]?off',
  'quality',
  'judg',
  'assessment',
  '\\bexpert\\b',
  '\\brisk\\b',
  '사용성',
  '화면',
  '유아이',
  '유엑스',
  '프론트엔드',
  '리뷰',
  '검토',
  '디버깅',
  '진단',
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
  '안전',
  '데이터베이스',
  '마이그레이션',
  '배포',
  '릴리즈',
  '출시',
  '모호',
  '트레이드오프',
  '품질',
  '판정',
  '위험'
].join('|'), 'i')

const CLEAR_BOUNDED_TASK_RE = new RegExp([
  '\\b(?:clear|bounded|exact|specified)\\b[^\n]{0,48}\\b(?:task|change|step|scope|fixture|file|implementation|rename|copy|format|inventory|extract|list|check)\\b',
  '\\b(?:mechanical|repeatable)\\b',
  '\\bstructured[- ]?(?:extract|extraction|output|inventory|list)\\b',
  'code_modification',
  'test_execution',
  'single[- ]?(?:file|step|check|change)',
  '(?:정해진|명확한?|단순한?|반복적?|기계적)[^\n]{0,32}(?:작업|변경|단계|파일|목록|추출|이름\\s*변경)'
].join('|'), 'i')

export function decideSubagentModel(input: {
  title?: string | undefined
  description?: string | undefined
  role?: string | undefined
  expectedOutput?: string | undefined
  requiresJudgment?: boolean | undefined
} = {}): SubagentModelDecision {
  const text = [
    input.title,
    input.description,
    input.role,
    input.expectedOutput
  ].filter(Boolean).join(' ')

  const useSol = input.requiresJudgment === true
    || SOL_TASK_RE.test(text)
    || !CLEAR_BOUNDED_TASK_RE.test(text)

  if (useSol) {
    return {
      kind: 'expert',
      model: THINKING_SUBAGENT_MODEL,
      modelReasoningEffort: SUBAGENT_EFFORT,
      reason: 'reasoning_sensitive_task'
    }
  }

  return {
    kind: 'worker',
    model: DEFAULT_SUBAGENT_MODEL,
    modelReasoningEffort: SUBAGENT_EFFORT,
    reason: 'clear_bounded_repeatable_task'
  }
}

export function isReasoningSensitiveSubagentTask(input: Parameters<typeof decideSubagentModel>[0] = {}): boolean {
  return decideSubagentModel(input).kind === 'expert'
}
