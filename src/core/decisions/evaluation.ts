import type { DecisionReceipt } from './types.js';

export function percentile(values: readonly number[], p: number): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank] ?? null;
}

export const EVALUATION_SCHEMA = 'sks.jev-evaluation.v1' as const;

export type EvaluationArm = 'deterministic_baseline' | 'archived_local_advice' | 'direct_jev';
export type EvidenceLevel = 'synthetic' | 'fixture' | 'live_protocol' | 'workload';

export interface EvaluationTaskRow {
  taskId: string;
  taskFamily: string;
  arm: EvaluationArm;
  success: boolean | null;
  escapedFailure: boolean | null;
  wallClockMs: number | null;
  jevOverheadMs: number | null;
  cacheHit: boolean;
  llmRejudgeCalls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  reportedCost: number | null;
  coveragePreserved: boolean;
  contextMaterialized: boolean;
  planCommitted: boolean;
  recoveryHandlerInvoked: boolean;
  nativeDispatchObserved: boolean;
  tokenEvidence: 'provider_response' | 'unknown';
}

export interface EvaluationReport {
  schema: typeof EVALUATION_SCHEMA;
  evidenceLevel: EvidenceLevel;
  live: boolean;
  arms: EvaluationArm[];
  taskCount: number;
  metrics: {
    taskSuccessRate: number | null;
    escapedFailureRate: number | null;
    wallClockP50Ms: number | null;
    wallClockP95Ms: number | null;
    jevOverheadP50Ms: number | null;
    llmRejudgeCalls: number;
    inputTokens: number | null;
    outputTokens: number | null;
    reportedCost: number | null;
    costPerSuccessfulTask: number | null;
    coveragePreservedRate: number | null;
  };
  unavailableReasons: string[];
  receipts: DecisionReceipt[];
}

export function buildEvaluationReport(input: {
  rows: readonly EvaluationTaskRow[];
  receipts?: readonly DecisionReceipt[];
  evidenceLevel?: EvidenceLevel;
  live?: boolean;
}): EvaluationReport {
  const unavailable: string[] = [];
  const rows = [...input.rows];
  if (rows.length === 0) unavailable.push('no_labeled_tasks');
  const success = rows.map((row) => row.success).filter((value): value is boolean => value !== null);
  const escaped = rows.map((row) => row.escapedFailure).filter((value): value is boolean => value !== null);
  const wall = rows.map((row) => row.wallClockMs).filter((value): value is number => Number.isFinite(value));
  const overhead = rows.map((row) => row.jevOverheadMs).filter((value): value is number => Number.isFinite(value));
  const tokenKnown = rows.every((row) => row.tokenEvidence === 'provider_response');
  if (!tokenKnown) unavailable.push('token_savings_unavailable');
  const inputTokens = tokenKnown
    ? sum(rows.map((row) => row.inputTokens))
    : null;
  const outputTokens = tokenKnown
    ? sum(rows.map((row) => row.outputTokens))
    : null;
  const cost = rows.some((row) => row.reportedCost === null)
    ? null
    : sum(rows.map((row) => row.reportedCost));
  if (cost === null) unavailable.push('cost_unavailable');
  const successes = rows.filter((row) => row.success === true).length;
  const costPerSuccess = cost === null || successes === 0 ? null : cost / successes;
  const coverage = rows.filter((row) => row.coveragePreserved).length;
  return {
    schema: EVALUATION_SCHEMA,
    evidenceLevel: input.evidenceLevel || 'synthetic',
    live: input.live === true,
    arms: [...new Set(rows.map((row) => row.arm))],
    taskCount: rows.length,
    metrics: {
      taskSuccessRate: success.length ? success.filter(Boolean).length / success.length : null,
      escapedFailureRate: escaped.length ? escaped.filter(Boolean).length / escaped.length : null,
      wallClockP50Ms: percentile(wall, 50),
      wallClockP95Ms: percentile(wall, 95),
      jevOverheadP50Ms: percentile(overhead, 50),
      llmRejudgeCalls: rows.reduce((sumValue, row) => sumValue + row.llmRejudgeCalls, 0),
      inputTokens,
      outputTokens,
      reportedCost: cost,
      costPerSuccessfulTask: costPerSuccess,
      coveragePreservedRate: rows.length ? coverage / rows.length : null
    },
    unavailableReasons: [...unavailable],
    receipts: [...(input.receipts || [])]
  };
}

function sum(values: readonly (number | null)[]): number | null {
  if (values.some((value) => value === null || !Number.isFinite(value))) return null;
  return values.reduce<number>((total, value) => total + (value || 0), 0);
}
