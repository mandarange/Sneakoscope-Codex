export type TaskProfile =
  | 'passthrough'
  | 'answer'
  | 'tiny-change'
  | 'bounded-work'
  | 'parallel-read'
  | 'parallel-write'
  | 'high-risk'

export type GateProfile = 'none' | 'minimal' | 'scoped' | 'full'

export const TASK_PROFILE_GATE_PROFILES = Object.freeze({
  passthrough: 'none',
  answer: 'none',
  'tiny-change': 'minimal',
  'bounded-work': 'scoped',
  'parallel-read': 'scoped',
  'parallel-write': 'scoped',
  'high-risk': 'full'
} satisfies Readonly<Record<TaskProfile, GateProfile>>)

const TASK_PROFILES = new Set<TaskProfile>(Object.keys(TASK_PROFILE_GATE_PROFILES) as TaskProfile[])

const GREETING_RE =
  /^(hi|hello|hey|thanks|thank you|good morning|good evening|안녕|안녕하세요|고마워|고마워요|감사해|감사합니다|잘 지내\??)[!.?\s]*$/i

const HIGH_RISK_RE =
  /\b(database|db|migration|security|permission|publish|release|deploy|auth|payment|production)\b|데이터베이스|디비|마이그레이션|보안|권한|배포|릴리즈|출시|인증|결제|운영/i

const PARALLEL_CUE_RE =
  /\b(parallel|subagents?|one agent per|fan out|multiple files|audit all|all files|independent slices?|naruto|shadow\s*clone|kagebunshin|swarm)\b|병렬|하위\s*에이전트|서브\s*에이전트|여러\s*파일|모든\s*파일|전체\s*검토|나루토|분담/i

const CHANGE_RE =
  /\b(fix|implement|change|edit|add|remove|delete|drop|modify|refactor|build|create|write|update|rename|rewrite|patch|apply|execute|publish|release|deploy|migrate)\b|고쳐|수정|변경|추가|삭제|구현|리팩터|작성|생성|만들어|업데이트|적용|실행|이름\s*변경|배포|출시|마이그레이션/i

const TINY_CHANGE_RE =
  /\b(typo|copy|wording|label|spacing|whitespace|punctuation|spelling|one[-\s]?line|single[-\s]?(?:line|word)|rename only)\b|오타|문구|라벨|띄어쓰기|공백|맞춤법|구두점|한\s*줄|단어\s*하나|이름만\s*변경/i

const EXPLANATION_QUESTION_RE =
  /^(how\s+(?:do|can|should|would)\s+(?:i|we|you)\b|what\b|why\b|when\b|where\b|which\b|explain\b|tell me how\b)|(?:어떻게|무엇|뭐가|왜|언제|어디|방법|설명)(?:.*(?:인가요|일까요|하나요|해요|할까|\?))?$/i

const DIRECT_REQUEST_RE =
  /^(please\s+|can you\s+|could you\s+|would you\s+)|(?:해줘|해주세요|해\s*주세요|바꿔줘|고쳐줘|수정해줘|구현해줘)/i

const EXPLANATION_REQUEST_RE = /^(?:can|could|would) you explain\b/i

export function classifyTaskProfile(prompt: unknown): TaskProfile {
  const text = String(prompt ?? '').trim()

  if (!text || GREETING_RE.test(text)) return 'passthrough'
  if (looksLikeExplanationQuestion(text)) return 'answer'
  if (HIGH_RISK_RE.test(text) && CHANGE_RE.test(text)) return 'high-risk'
  if (PARALLEL_CUE_RE.test(text) && CHANGE_RE.test(text)) return 'parallel-write'
  if (PARALLEL_CUE_RE.test(text)) return 'parallel-read'
  if (looksLikeTinyChange(text)) return 'tiny-change'
  if (CHANGE_RE.test(text)) return 'bounded-work'
  return 'answer'
}

export function gateProfileForTask(profileOrPrompt: TaskProfile | unknown): GateProfile {
  const profile = isTaskProfile(profileOrPrompt)
    ? profileOrPrompt
    : classifyTaskProfile(profileOrPrompt)
  return TASK_PROFILE_GATE_PROFILES[profile]
}

export function isTaskProfile(value: unknown): value is TaskProfile {
  return TASK_PROFILES.has(String(value || '') as TaskProfile)
}

function looksLikeTinyChange(text: string): boolean {
  return CHANGE_RE.test(text) && TINY_CHANGE_RE.test(text)
}

function looksLikeExplanationQuestion(text: string): boolean {
  return (EXPLANATION_QUESTION_RE.test(text) || EXPLANATION_REQUEST_RE.test(text))
    && (EXPLANATION_REQUEST_RE.test(text) || !DIRECT_REQUEST_RE.test(text))
}
