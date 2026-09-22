import { randomId } from '../fsx.js';
import { redactDecisionValue } from './openrouter.js';
import {
  RECEIPT_SCHEMA,
  UNKNOWN_USAGE,
  type CompiledDecision,
  type DecisionBinding,
  type DecisionReceipt,
  type UsageReceipt
} from './types.js';

export function usageReceiptFromCompiled(compiled: CompiledDecision): UsageReceipt {
  return { ...compiled.usage };
}

export function unknownUsageReceipt(): UsageReceipt {
  return { ...UNKNOWN_USAGE };
}

export function cacheHitUsage(historical: UsageReceipt): UsageReceipt {
  return {
    inputTokens: historical.inputTokens,
    outputTokens: historical.outputTokens,
    reportedCost: historical.reportedCost,
    evidence: historical.evidence
  };
}

export function buildDecisionReceipt(input: {
  binding: DecisionBinding;
  compiled: CompiledDecision;
  result: DecisionReceipt['result'];
  reason: string;
  elapsedMs: number;
  cacheHit?: boolean;
  resolvedModel?: string | null;
  responseId?: string | null;
  consumptionEvidence?: string | null;
  env?: NodeJS.ProcessEnv;
}): DecisionReceipt {
  const usage = input.cacheHit
    ? {
        inputTokens: input.compiled.usage.inputTokens,
        outputTokens: input.compiled.usage.outputTokens,
        reportedCost: null,
        evidence: input.compiled.usage.evidence
      }
    : { ...input.compiled.usage };
  const receipt: DecisionReceipt = {
    schema: RECEIPT_SCHEMA,
    decisionId: `jev-${randomId(12)}`,
    binding: input.binding,
    resolvedModel: input.resolvedModel ?? (input.compiled.kind === 'apply' ? input.compiled.resolvedModel : null),
    responseId: input.responseId ?? null,
    result: input.result,
    reason: input.reason,
    usage,
    elapsedMs: Math.max(0, Math.trunc(input.elapsedMs)),
    cacheHit: input.cacheHit === true,
    consumptionEvidence: input.consumptionEvidence ?? null
  };
  return redactDecisionValue(receipt, input.env);
}
