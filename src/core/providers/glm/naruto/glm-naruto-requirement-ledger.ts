import type { GlmNarutoRequirementLedger } from './glm-naruto-types.js';

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
    required = true
  ): void => {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean || seen.has(`${source}:${clean.toLowerCase()}`)) return;
    seen.add(`${source}:${clean.toLowerCase()}`);
    requirements.push({
      id: `REQ-${String(requirements.length + 1).padStart(3, '0')}`,
      text: clean,
      source,
      required
    });
  };

  for (const clause of splitRequirementClauses(input.task)) {
    const lower = clause.toLowerCase();
    if (/\b(must|without|do not|don't|preserve|only|never|no fallback|no fake|금지|필수|보존|없이|만)\b/.test(lower)) {
      add(clause, 'user_task', true);
    }
  }

  for (const file of input.mentionedPaths ?? []) {
    add(`Touch or preserve mentioned path: ${file}`, 'user_task', true);
  }

  if (input.gitStatus && input.gitStatus.trim()) {
    add('Preserve pre-existing dirty worktree changes unless explicitly selected.', 'git_status', true);
  }

  if (requirements.length === 0) add(input.task, 'user_task', true);

  return {
    schema: 'sks.glm-naruto-requirement-ledger.v1',
    mission_id: input.missionId,
    requirements
  };
}

function splitRequirementClauses(task: string): readonly string[] {
  return task
    .split(/\r?\n|[.;]|(?:\s+-\s+)/g)
    .map((part) => part.replace(/^[-*\d.)\s]+/, '').trim())
    .filter(Boolean);
}
