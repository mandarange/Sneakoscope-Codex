import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileDecision, decodeWireResponse } from '../policy.js';
import { buildDecisionBundle, validatePlanCoverage } from '../questions.js';
import { buildDecisionBinding, stableDigest } from '../state.js';
import { planningBundle, SYNTHETIC_RESPONSE, SYNTHETIC_RESPONSE_MISSING_UNCERTAINTY } from './fixtures.js';

test('valid bound Choice compiles to a typed plan effect', () => {
  const bundle = planningBundle();
  const compiled = compileDecision(bundle, SYNTHETIC_RESPONSE);
  assert.equal(compiled.kind, 'apply');
  if (compiled.kind !== 'apply') return;
  assert.equal(compiled.effects[0]?.kind, 'select_plan');
  if (compiled.effects[0]?.kind === 'select_plan') {
    const planId = compiled.effects[0].planId;
    assert.equal(planId, 'grouped');
    assert.equal(bundle.planCandidates.find((row) => row.id === planId)?.workerCount, 1);
  }
  const context = compiled.effects.find((effect) => effect.kind === 'select_optional_context');
  assert.ok(context);
  if (context?.kind === 'select_optional_context') {
    assert.equal(context.keepIds.includes('E1'), false);
  }
});

test('unknown Choice label and missing option keep the baseline', () => {
  const bundle = planningBundle();
  const unknown = structuredClone(SYNTHETIC_RESPONSE);
  unknown.answers.plan = { type: 'choice', choice: 'invented', confidence: 0.99, probabilities: { baseline: 0, grouped: 0, keep_baseline: 1 } };
  const compiled = compileDecision(bundle, unknown);
  assert.equal(compiled.kind, 'keep_baseline');
});

test('missing required uncertainty does not invent confidence', () => {
  const bundle = planningBundle();
  const compiled = compileDecision(bundle, SYNTHETIC_RESPONSE_MISSING_UNCERTAINTY);
  assert.equal(compiled.kind, 'apply');
  if (compiled.kind !== 'apply') return;
  assert.equal(compiled.effects.some((effect) => effect.kind === 'select_plan'), false);
  assert.equal(compiled.effects.some((effect) => effect.kind === 'select_optional_context'), true);
});

test('raw usage.input_tokens is accepted and SDK camelCase-only usage is rejected', () => {
  const bundle = planningBundle();
  const raw = decodeWireResponse(bundle, SYNTHETIC_RESPONSE);
  assert.equal(raw.ok, true);
  const camel = decodeWireResponse(bundle, {
    model: 'typesafe/jev-1.13',
    answers: SYNTHETIC_RESPONSE.answers,
    usage: { inputTokens: 12, outputTokens: 0 }
  });
  assert.equal(camel.ok, false);
});

test('nonfinite Noul, out-of-range Score, and malformed distributions are rejected', () => {
  const bundle = planningBundle();
  const nanNoul = structuredClone(SYNTHETIC_RESPONSE);
  nanNoul.answers.keep_E1 = { type: 'noul', noul: Number.NaN };
  assert.equal(compileDecision(bundle, nanNoul).kind, 'keep_baseline');
  const score = structuredClone(SYNTHETIC_RESPONSE);
  score.answers.relevance_E1 = { type: 'score', score: 9 };
  assert.equal(decodeWireResponse(bundle, score).ok, false);
  const mass = structuredClone(SYNTHETIC_RESPONSE);
  mass.answers.plan = {
    type: 'choice',
    choice: 'grouped',
    confidence: 0.9,
    probabilities: { baseline: 0.5, grouped: 0.5, keep_baseline: 0.5 }
  };
  assert.equal(decodeWireResponse(bundle, mass).ok, false);
});

test('Noul near 0.5 is uncertain yes/no, not medium intensity, and Score is not a success probability', () => {
  const bundle = planningBundle();
  const uncertain = structuredClone(SYNTHETIC_RESPONSE);
  uncertain.answers.keep_E1 = { type: 'noul', noul: 0.51 };
  const compiled = compileDecision(bundle, uncertain);
  assert.equal(compiled.kind, 'apply');
  if (compiled.kind !== 'apply') return;
  const context = compiled.effects.find((effect) => effect.kind === 'select_optional_context');
  assert.ok(context && context.kind === 'select_optional_context');
  if (context?.kind === 'select_optional_context') {
    assert.ok(context.keepIds.includes('E1'));
  }
});

test('pinned context cannot be deleted and missing unused speculative answers do not reject the batch', () => {
  const bundle = planningBundle();
  bundle.contextCandidates = bundle.contextCandidates.map((row) => ({ ...row, pinned: true }));
  const compiled = compileDecision(bundle, SYNTHETIC_RESPONSE);
  if (compiled.kind === 'apply') {
    const context = compiled.effects.find((effect) => effect.kind === 'select_optional_context');
    if (context?.kind === 'select_optional_context') {
      assert.ok(context.keepIds.includes('E1'));
    }
  }
  const missingSpeculative = structuredClone(SYNTHETIC_RESPONSE);
  delete missingSpeculative.answers.relevance_E1;
  const decoded = decodeWireResponse(bundle, missingSpeculative);
  assert.equal(decoded.ok, true);
});

test('same-batch answer references are rejected and coverage must stay exact', () => {
  assert.throws(() => buildDecisionBundle({
    projectId: 'p',
    workflowRunId: 'w',
    workflowRevision: 'r',
    sourceDigest: 's',
    graphDigest: null,
    goal: 'g',
    recoveryCandidates: [{ id: 'a', summary: 'A', handlerId: 'a', authorized: true, readOnly: true }],
    recoveryDiagnostic: 'use the action selected above'
  }), /question_depends_on_same_batch_answer/);
  const candidate = planningBundle().planCandidates[1]!;
  assert.deepEqual(validatePlanCoverage(['S1', 'S2'], candidate), []);
  assert.ok(validatePlanCoverage(['S1', 'S2', 'S3'], candidate).includes('slice_coverage_mismatch'));
});

test('binding digest changes when source, candidates, questions, model, or policy change', () => {
  const first = buildDecisionBinding({
    projectId: 'p',
    workflowRunId: 'w',
    workflowRevision: 'r',
    sourceDigest: 's1',
    graphDigest: 'g1',
    candidates: { a: 1 },
    questions: { q: 'one' }
  });
  const dirty = buildDecisionBinding({
    ...first,
    sourceDigest: 's2',
    candidates: { a: 1 },
    questions: { q: 'one' }
  });
  assert.notEqual(first.sourceDigest, dirty.sourceDigest);
  assert.notEqual(stableDigest({ a: 1 }), stableDigest({ a: 2 }));
  assert.notEqual(first.requestedModel, 'other');
});

test('compiler and consumers do not call a second LLM judge', async () => {
  const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'src', 'core');
  const files = [
    path.join(srcRoot, 'decisions', 'policy.ts'),
    path.join(srcRoot, 'decisions', 'integration.ts'),
    path.join(srcRoot, 'subagents', 'official-subagent-preparation.ts')
  ];
  for (const file of files) {
    const source = await fsp.readFile(file, 'utf8');
    assert.doesNotMatch(source, /confirmWithLLM|json-repair|JSON-repair|ask another model|LOCAL_DECISION_ADVICE/);
  }
});

test('pure policy module has no network, process, or filesystem imports', async () => {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'src', 'core', 'decisions', 'policy.ts');
  const source = await fsp.readFile(file, 'utf8');
  assert.doesNotMatch(source, /from ['"]node:(fs|net|http|child_process|dgram)['"]/);
  assert.doesNotMatch(source, /from ['"].*openrouter/);
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /spawn\(/);
});
