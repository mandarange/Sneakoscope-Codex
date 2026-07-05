import type { GlmNarutoRequirementLedger } from './glm-naruto-types.js';

const CONSTRAINT_CLAUSE_PATTERN =
  /\b(must|without|do not|don't|preserve|only|never|no fallback|no fake|금지|필수|보존|없이|만)\b/;

export function buildGlmNarutoRequirementLedger(input: {
  readonly missionId: string;
  readonly task: string;
  readonly mentionedPaths?: readonly string[];
  readonly gitStatus?: string;
}): GlmNarutoRequirementLedger {
  const requirements: GlmNarutoRequirementLedger['requirements'][number][] = [];
  const seen = new Set<string>();
  const add = (
    text: string,
    source: GlmNarutoRequirementLedger['requirements'][number]['source'],
    required = true,
    kind: GlmNarutoRequirementLedger['requirements'][number]['kind'] = 'task'
  ): void => {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean || seen.has(`${source}:${clean.toLowerCase()}`)) return;
    seen.add(`${source}:${clean.toLowerCase()}`);
    requirements.push({
      id: `REQ-${String(requirements.length + 1).padStart(3, '0')}`,
      text: clean,
      source,
      required,
      kind
    });
  };

  for (const clause of splitRequirementClauses(input.task)) {
    const kind = CONSTRAINT_CLAUSE_PATTERN.test(clause.toLowerCase()) ? 'constraint' : 'task';
    add(clause, 'user_task', true, kind);
  }

  for (const file of input.mentionedPaths ?? []) {
    add(`Touch or preserve mentioned path: ${file}`, 'user_task', true, 'constraint');
  }

  if (input.gitStatus && input.gitStatus.trim()) {
    add('Preserve pre-existing dirty worktree changes unless explicitly selected.', 'git_status', true, 'constraint');
  }

  if (requirements.length === 0) add(input.task, 'user_task', true, 'task');

  return {
    schema: 'sks.glm-naruto-requirement-ledger.v1',
    mission_id: input.missionId,
    requirements
  };
}

function splitRequirementClauses(task: string): readonly string[] {
  const byLine = task
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);

  const clauses: string[] = [];
  for (const line of byLine) {
    const byMarker = line
      .split(/(?:\s+-\s+)|(?=(?:^|\s)(?:\d+[.)]|[-*•])\s)/g)
      .map((part) => part.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter(Boolean);

    const segments = byMarker.length > 1 ? byMarker : [line];
    for (const segment of segments) {
      const bySentence = segment
        .split(/(?<=[.;!?])\s+(?=[A-Z0-9가-힣])|[;]/g)
        .map((part) => part.replace(/^[-*•\d.)\s]+/, '').trim())
        .filter(Boolean);
      clauses.push(...(bySentence.length > 0 ? bySentence : [segment]));
    }
  }

  return clauses.filter(Boolean);
}
