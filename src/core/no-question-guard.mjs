export const QUESTION_PATTERNS = [
  /\?/,
  /어떻게\s*할까요/i,
  /확인해\s*주세요/i,
  /선택해\s*주세요/i,
  /알려\s*주세요/i,
  /답변(?:이|을)?\s*필요/i,
  /사용자.*(?:결정|입력|확인|답변)/i,
  /진행해도\s*될까요/i,
  /원하시나요/i,
  /please\s+confirm/i,
  /would\s+you\s+like/i,
  /should\s+i/i,
  /need\s+your\s+(input|confirmation|decision)/i,
  /which\s+option\s+do\s+you\s+prefer/i
];

export function containsUserQuestion(text = '') {
  if (!text) return false;
  return QUESTION_PATTERNS.some((p) => p.test(text));
}

export function noQuestionContinuationReason() {
  return [
    'SKS_NO_QUESTION_LOCK is active.',
    'Do not ask the user, do not request confirmation, and do not present choices.',
    'Resolve using decision-contract.json: seed contract → explicit user answers → approved defaults → AGENTS.md → current code/tests → smallest reversible change → defer optional scope.',
    'If a risky required path has no safe resolution, complete the safe core scope and record limitation in done-gate.json; do not ask the user mid-loop.',
    'Continue the active SKS loop.'
  ].join(' ');
}

export function interactiveCommandReason(command = '') {
  return `Interactive or approval-seeking command is forbidden during SKS no-question mode: ${command}`;
}

export function looksInteractiveCommand(command = '') {
  const patterns = [
    /(^|\s)read\s+-?p?\b/i,
    /(^|\s)select\s+/i,
    /(^|\s)sudo\b/i,
    /git\s+rebase\s+-i/i,
    /(^|\s)(npm|pnpm|yarn)\s+init\b/i,
    /(^|\s)(npm|pnpm|yarn)\s+create\b/i,
    /(^|\s)ssh\b/i,
    /mysql\b.*\s-p(\s|$)/i,
    /psql\b.*\s-W(\s|$)/i,
    /(^|\s)rm\s+-i\b/i,
    /(^|\s)mv\s+-i\b/i,
    /(^|\s)cp\s+-i\b/i
  ];
  return patterns.some((p) => p.test(command));
}
