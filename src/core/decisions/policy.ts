/**
 * Pure compiler. It must not import network, model, process, or filesystem
 * modules. It maps a validated wire response onto typed effects or baseline.
 */
import {
  CHOICE_MIN_CONFIDENCE,
  CHOICE_MIN_PROBABILITY,
  CONTEXT_DROP_NOUL_MAX,
  DISTRIBUTION_SUM_TOLERANCE,
  KEEP_BASELINE_CHOICE,
  NEEDS_EVIDENCE_CHOICE,
  POLICY_REVISION,
  UNKNOWN_USAGE,
  type Answer,
  type BaselineReason,
  type CompiledDecision,
  type ContextCandidate,
  type DecisionBundle,
  type DecisionEffect,
  type DecisionsWireResponse,
  type DecisionsWireUsage,
  type Question,
  type UsageReceipt
} from './types.js';

export function compileDecision(bundle: DecisionBundle, response: DecisionsWireResponse): CompiledDecision {
  const usage = usageFromWire(response.usage);
  const decoded = decodeWireResponse(bundle, response);
  if (!decoded.ok) {
    return { kind: 'keep_baseline', binding: bundle.binding, reason: decoded.reason, usage };
  }
  const effects: DecisionEffect[] = [];
  let fallbackReason: BaselineReason | null = null;

  const planBinding = Object.entries(bundle.questionBindings).find(([, binding]) => binding.kind === 'plan');
  if (planBinding) {
    const compiled = compilePlan(bundle, decoded.response.answers[planBinding[0]]);
    if (compiled.kind === 'effect') effects.push(compiled.effect);
    else if (!fallbackReason) fallbackReason = compiled.reason;
  }

  const contextEffect = compileContext(bundle, decoded.response.answers);
  if (contextEffect.kind === 'effect') effects.push(contextEffect.effect);
  else if (contextEffect.reason && !fallbackReason) fallbackReason = contextEffect.reason;

  const recoveryBinding = Object.entries(bundle.questionBindings).find(([, binding]) => binding.kind === 'recovery');
  if (recoveryBinding) {
    const compiled = compileRecovery(bundle, decoded.response.answers[recoveryBinding[0]]);
    if (compiled.kind === 'effect') effects.push(compiled.effect);
    else if (!fallbackReason) fallbackReason = compiled.reason;
  }

  if (effects.length === 0) {
    return {
      kind: 'keep_baseline',
      binding: bundle.binding,
      reason: fallbackReason || 'keep_baseline_selected',
      usage
    };
  }
  return {
    kind: 'apply',
    binding: bundle.binding,
    resolvedModel: decoded.response.model,
    effects: effects as [DecisionEffect, ...DecisionEffect[]],
    usage
  };
}

export function decodeWireResponse(
  bundle: DecisionBundle,
  response: unknown
): { ok: true; response: DecisionsWireResponse } | { ok: false; reason: BaselineReason } {
  if (!isRecord(response)) return { ok: false, reason: 'invalid_response' };
  if (hasOwn(response, 'inputTokens') && !hasOwn(response, 'usage')) {
    return { ok: false, reason: 'invalid_response' };
  }
  const model = text(response.model);
  if (!model) return { ok: false, reason: 'invalid_response' };
  if (model !== bundle.binding.requestedModel) return { ok: false, reason: 'unknown_model' };
  const answersRaw = response.answers;
  if (!isRecord(answersRaw)) return { ok: false, reason: 'invalid_response' };
  const usage = decodeUsage(response.usage);
  if (!usage) return { ok: false, reason: 'invalid_response' };

  const answers: Record<string, Answer> = {};
  for (const [id, question] of Object.entries(bundle.request.questions)) {
    const rawAnswer = answersRaw[id];
    if (rawAnswer === undefined) {
      if (isRequiredQuestion(bundle, id)) return { ok: false, reason: 'missing_answer' };
      continue;
    }
    const decoded = decodeAnswer(question, rawAnswer);
    if (!decoded.ok) return { ok: false, reason: decoded.reason };
    answers[id] = decoded.answer;
  }

  const decoded: DecisionsWireResponse = {
    model,
    answers,
    usage
  };
  const id = text(response.id);
  if (id) decoded.id = id;
  const provider = text(response.provider);
  if (provider) decoded.provider = provider;
  return { ok: true, response: decoded };
}

export function usageFromWire(usage: DecisionsWireUsage | null | undefined): UsageReceipt {
  if (!usage) return { ...UNKNOWN_USAGE };
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    reportedCost: usage.cost === undefined ? null : usage.cost,
    evidence: 'provider_response'
  };
}

export function decodeUsage(value: unknown): DecisionsWireUsage | null {
  if (!isRecord(value)) return null;
  if (hasOwn(value, 'inputTokens') && !hasOwn(value, 'input_tokens')) return null;
  if (hasOwn(value, 'outputTokens') && !hasOwn(value, 'output_tokens')) return null;
  const inputTokens = value.input_tokens;
  const outputTokens = value.output_tokens;
  if (!isFiniteNumber(inputTokens) || inputTokens < 0) return null;
  if (!isFiniteNumber(outputTokens) || outputTokens < 0) return null;
  const usage: DecisionsWireUsage = {
    input_tokens: inputTokens,
    output_tokens: outputTokens
  };
  if (hasOwn(value, 'cost')) {
    if (!isFiniteNumber(value.cost) || value.cost < 0) return null;
    usage.cost = value.cost;
  }
  return usage;
}

function compilePlan(
  bundle: DecisionBundle,
  answer: Answer | undefined
): { kind: 'effect'; effect: DecisionEffect } | { kind: 'baseline'; reason: BaselineReason } {
  if (!answer) return { kind: 'baseline', reason: 'missing_answer' };
  if (answer.type !== 'choice') return { kind: 'baseline', reason: 'invalid_response' };
  if (answer.choice === KEEP_BASELINE_CHOICE) return { kind: 'baseline', reason: 'keep_baseline_selected' };
  const candidate = bundle.planCandidates.find((row) => row.id === answer.choice);
  if (!candidate) return { kind: 'baseline', reason: 'invalid_response' };
  const uncertainty = requiredChoiceUncertainty(answer, planChoiceIds(bundle));
  if (!uncertainty.ok) return { kind: 'baseline', reason: uncertainty.reason };
  return { kind: 'effect', effect: { kind: 'select_plan', planId: candidate.id } };
}

function compileContext(
  bundle: DecisionBundle,
  answers: Record<string, Answer>
): { kind: 'effect'; effect: DecisionEffect } | { kind: 'baseline'; reason: BaselineReason | null } {
  const optional = bundle.contextCandidates.filter((row) => !row.pinned);
  if (optional.length === 0) return { kind: 'baseline', reason: null };
  const keepIds = new Set(bundle.contextCandidates.filter((row) => row.pinned).map((row) => row.id));
  let sawUsable = false;
  for (const [questionId, binding] of Object.entries(bundle.questionBindings)) {
    if (binding.kind !== 'context_keep') continue;
    const candidate = bundle.contextCandidates.find((row) => row.id === binding.candidateId);
    if (!candidate || candidate.pinned) continue;
    const answer = answers[questionId];
    if (!answer) continue;
    if (answer.type !== 'noul') return { kind: 'baseline', reason: 'invalid_response' };
    if (!isFiniteNumber(answer.noul) || answer.noul < 0 || answer.noul > 1) {
      return { kind: 'baseline', reason: 'invalid_response' };
    }
    sawUsable = true;
    if (canDropOptional(candidate, answer.noul)) continue;
    keepIds.add(candidate.id);
  }
  for (const candidate of optional) {
    if (!Object.values(bundle.questionBindings).some((binding) => (
      binding.kind === 'context_keep' && binding.candidateId === candidate.id
    ))) {
      keepIds.add(candidate.id);
    }
  }
  if (!sawUsable) return { kind: 'baseline', reason: null };
  return { kind: 'effect', effect: { kind: 'select_optional_context', keepIds: [...keepIds] } };
}

function compileRecovery(
  bundle: DecisionBundle,
  answer: Answer | undefined
): { kind: 'effect'; effect: DecisionEffect } | { kind: 'baseline'; reason: BaselineReason } {
  if (!answer) return { kind: 'baseline', reason: 'missing_answer' };
  if (answer.type !== 'choice') return { kind: 'baseline', reason: 'invalid_response' };
  if (answer.choice === KEEP_BASELINE_CHOICE) return { kind: 'baseline', reason: 'keep_baseline_selected' };
  if (answer.choice === NEEDS_EVIDENCE_CHOICE) return { kind: 'baseline', reason: 'needs_evidence' };
  const candidate = bundle.recoveryCandidates.find((row) => row.id === answer.choice && row.authorized);
  if (!candidate) return { kind: 'baseline', reason: 'invalid_response' };
  const labels = [
    ...bundle.recoveryCandidates.map((row) => row.id),
    KEEP_BASELINE_CHOICE,
    NEEDS_EVIDENCE_CHOICE
  ];
  const uncertainty = requiredChoiceUncertainty(answer, labels);
  if (!uncertainty.ok) return { kind: 'baseline', reason: uncertainty.reason };
  return { kind: 'effect', effect: { kind: 'dispatch_recovery', actionId: candidate.id } };
}

function canDropOptional(candidate: ContextCandidate, noul: number): boolean {
  return !candidate.pinned
    && candidate.fresh
    && candidate.reproducible
    && Boolean(candidate.excerpt)
    && noul <= CONTEXT_DROP_NOUL_MAX;
}

function requiredChoiceUncertainty(
  answer: Extract<Answer, { type: 'choice' }>,
  expectedKeys: readonly string[]
): { ok: true } | { ok: false; reason: BaselineReason } {
  if (answer.confidence === undefined || answer.probabilities === undefined) {
    return { ok: false, reason: 'insufficient_uncertainty' };
  }
  if (!isFiniteNumber(answer.confidence) || answer.confidence < 0 || answer.confidence > 1) {
    return { ok: false, reason: 'invalid_response' };
  }
  const distribution = validateDistribution(answer.probabilities, expectedKeys);
  if (!distribution.ok) return distribution;
  const selected = answer.probabilities[answer.choice];
  if (!isFiniteNumber(selected)) return { ok: false, reason: 'invalid_response' };
  if (answer.confidence < CHOICE_MIN_CONFIDENCE || selected < CHOICE_MIN_PROBABILITY) {
    return { ok: false, reason: 'uncertain' };
  }
  return { ok: true };
}

export function validateDistribution(
  probabilities: Record<string, number>,
  expectedKeys: readonly string[]
): { ok: true } | { ok: false; reason: BaselineReason } {
  const keys = Object.keys(probabilities);
  if (keys.length !== expectedKeys.length) return { ok: false, reason: 'invalid_response' };
  const expected = new Set(expectedKeys);
  let sum = 0;
  for (const key of keys) {
    if (!expected.has(key)) return { ok: false, reason: 'invalid_response' };
    const value = probabilities[key];
    if (!isFiniteNumber(value) || value < 0 || value > 1) return { ok: false, reason: 'invalid_response' };
    sum += value;
  }
  if (Math.abs(sum - 1) > DISTRIBUTION_SUM_TOLERANCE) return { ok: false, reason: 'invalid_response' };
  return { ok: true };
}

function decodeAnswer(
  question: Question,
  raw: unknown
): { ok: true; answer: Answer } | { ok: false; reason: BaselineReason } {
  if (!isRecord(raw)) return { ok: false, reason: 'invalid_response' };
  const type = text(raw.type);
  if (type !== question.type) {
    if (type === 'choice' || type === 'noul' || type === 'score') {
      return { ok: false, reason: 'invalid_response' };
    }
    return { ok: false, reason: 'invalid_response' };
  }
  if (question.type === 'choice') {
    const choice = text(raw.choice);
    if (!choice) return { ok: false, reason: 'invalid_response' };
    const allowed = new Set([...Object.keys(question.criteria), KEEP_BASELINE_CHOICE, NEEDS_EVIDENCE_CHOICE]);
    if (!allowed.has(choice)) return { ok: false, reason: 'invalid_response' };
    const answer: Extract<Answer, { type: 'choice' }> = { type: 'choice', choice };
    if (hasOwn(raw, 'confidence')) {
      if (!isFiniteNumber(raw.confidence) || raw.confidence < 0 || raw.confidence > 1) {
        return { ok: false, reason: 'invalid_response' };
      }
      answer.confidence = raw.confidence;
    }
    if (hasOwn(raw, 'probabilities')) {
      if (!isRecord(raw.probabilities)) return { ok: false, reason: 'invalid_response' };
      const probabilities: Record<string, number> = {};
      for (const [key, value] of Object.entries(raw.probabilities)) {
        if (!isFiniteNumber(value) || value < 0 || value > 1) return { ok: false, reason: 'invalid_response' };
        probabilities[key] = value;
      }
      const expected = Object.keys(question.criteria);
      const checked = validateDistribution(probabilities, expected);
      if (!checked.ok) return checked;
      answer.probabilities = probabilities;
    }
    return { ok: true, answer };
  }
  if (question.type === 'noul') {
    if (!isFiniteNumber(raw.noul) || raw.noul < 0 || raw.noul > 1) {
      return { ok: false, reason: 'invalid_response' };
    }
    return { ok: true, answer: { type: 'noul', noul: raw.noul } };
  }
  if (!isFiniteNumber(raw.score) || raw.score < 0 || raw.score > question.criteria.length - 1) {
    return { ok: false, reason: 'invalid_response' };
  }
  const answer: Extract<Answer, { type: 'score' }> = { type: 'score', score: raw.score };
  if (hasOwn(raw, 'confidence')) {
    if (!isFiniteNumber(raw.confidence) || raw.confidence < 0 || raw.confidence > 1) {
      return { ok: false, reason: 'invalid_response' };
    }
    answer.confidence = raw.confidence;
  }
  if (hasOwn(raw, 'probabilities')) {
    if (!isRecord(raw.probabilities)) return { ok: false, reason: 'invalid_response' };
    const probabilities: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw.probabilities)) {
      if (!isFiniteNumber(value) || value < 0 || value > 1) return { ok: false, reason: 'invalid_response' };
      probabilities[key] = value;
    }
    const expected = question.criteria.map((_, index) => String(index));
    const checked = validateDistribution(probabilities, expected);
    if (!checked.ok) return checked;
    answer.probabilities = probabilities;
  }
  return { ok: true, answer };
}

function planChoiceIds(bundle: DecisionBundle): string[] {
  return [...bundle.planCandidates.map((row) => row.id), KEEP_BASELINE_CHOICE];
}

function isRequiredQuestion(bundle: DecisionBundle, id: string): boolean {
  const binding = bundle.questionBindings[id];
  return binding?.kind === 'plan' || binding?.kind === 'recovery' || binding?.kind === 'context_keep';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export const COMPILER_POLICY_REVISION = POLICY_REVISION;
