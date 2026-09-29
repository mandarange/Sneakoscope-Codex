import { runMachineFeedback } from '../verification/machine-feedback.js';
import { scanImpact } from '../verification/impact-scan.js';

export interface TournamentCandidate {
  id: string;
  approach: string;
  worktree: string;
  patch: any;
  score: CandidateScore | null;
}

export interface CandidateScore {
  machine_ok: boolean;
  tests_passed: number;
  tests_failed: number;
  diff_lines: number;
  new_symbols: number;
  impact_breaks: number;
  total: number;
}

export interface TournamentResult {
  schema: 'sks.solution-tournament.v1';
  winner: TournamentCandidate | null;
  reason: string;
  candidates: TournamentCandidate[];
}


export const APPROACHES = [
  '기존 코드 재사용을 극대화하는 최소 diff 접근',
  '해당 모듈의 지배적 패턴을 따르는 정석 접근',
  '근본 원인을 한 단계 위에서 해결하는 구조적 접근',
  '테스트와 관찰 가능성을 먼저 고정하는 증거 중심 접근'
];

export async function scoreCandidate(root: string, candidate: TournamentCandidate): Promise<CandidateScore> {
  const patchText = patchTextFromCandidate(candidate);
  const changedFiles = changedFilesFromCandidate(candidate);
  const feedbackRoot = candidate.worktree || root;
  const [feedback, impact] = await Promise.all([
    runMachineFeedback(feedbackRoot, changedFiles, { timeoutMs: 60_000 }),
    scanImpact(feedbackRoot, changedFiles, patchText)
  ]);
  const score = {
    machine_ok: feedback.ok,
    tests_passed: feedback.tests.ok ? feedback.tests.selected.length : 0,
    tests_failed: feedback.tests.failed.length,
    diff_lines: diffLineCount(patchText),
    new_symbols: newExportCount(patchText),
    impact_breaks: impact.cochange_required.length,
    total: 0
  };
  score.total = rank(score);
  return score;
}

export function summarizeTournament(result: TournamentResult) {
  return {
    schema: result.schema,
    winner_id: result.winner?.id || null,
    reason: result.reason,
    candidates: result.candidates.map((candidate) => ({
      id: candidate.id,
      approach: candidate.approach,
      worktree: candidate.worktree,
      score: candidate.score
    }))
  };
}

export function rank(s: CandidateScore): number {
  return s.tests_failed * 1000 + s.impact_breaks * 500 + s.new_symbols * 20 + s.diff_lines;
}

function changedFilesFromCandidate(candidate: TournamentCandidate): string[] {
  const patch = candidate.patch || {};
  if (Array.isArray(patch.changed_files)) return patch.changed_files.map(String);
  if (Array.isArray(patch.git_worktree?.changed_files)) return patch.git_worktree.changed_files.map(String);
  if (Array.isArray(patch.operations)) return [...new Set<string>(patch.operations.map((operation: any) => String(operation.path || '')).filter(Boolean))];
  if (Array.isArray(patch.patch_envelopes)) return [...new Set<string>(patch.patch_envelopes.flatMap((envelope: any) => changedFilesFromCandidate({ ...candidate, patch: envelope })))];
  return [];
}

function patchTextFromCandidate(candidate: TournamentCandidate): string {
  const patch = candidate.patch || {};
  if (typeof patch.diff === 'string') return patch.diff;
  if (typeof patch.patch_text === 'string') return patch.patch_text;
  if (Array.isArray(patch.operations)) return patch.operations.map((operation: any) => operation.diff || operation.content || operation.replace || '').join('\n');
  if (Array.isArray(patch.patch_envelopes)) return patch.patch_envelopes.map((envelope: any) => patchTextFromCandidate({ ...candidate, patch: envelope })).join('\n');
  return '';
}

function diffLineCount(patchText: string): number {
  return String(patchText || '').split(/\r?\n/).filter((line) => /^[+-]/.test(line) && !/^(---|\+\+\+)/.test(line)).length;
}

function newExportCount(patchText: string): number {
  return String(patchText || '').split(/\r?\n/).filter((line) => /^\+\s*export\s+(?:async\s+)?(?:function|const|class|interface|type)\s+\w+/.test(line)).length;
}
