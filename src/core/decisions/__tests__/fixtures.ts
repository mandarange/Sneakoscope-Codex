import type {
  DecisionBundle,
  DecisionsWireRequest,
  DecisionsWireResponse,
  PlanCandidate
} from '../types.js';
import { buildDecisionBundle } from '../questions.js';

export const SYNTHETIC_NOTICE = 'Synthetic example; not a live response or benchmark result.';

export const SYNTHETIC_CANARY_REQUEST: DecisionsWireRequest = {
  model: 'typesafe/jev-1.13',
  provider: { zdr: true, data_collection: 'deny', allow_fallbacks: false },
  state: {
    notice: 'Synthetic connectivity probe only. No repository or personal data.',
    status: 'failed',
    diagnostic: 'A synthetic test failed.'
  },
  questions: {
    status: {
      type: 'choice',
      instructions: 'Which status is explicitly recorded in state.status?',
      criteria: {
        passed: 'The recorded status is passed.',
        failed: 'The recorded status is failed.'
      }
    },
    has_failure: {
      type: 'noul',
      instructions: 'Does state.diagnostic explicitly describe a failure?'
    },
    severity: {
      type: 'score',
      instructions: 'How directly does state.diagnostic state a failure?',
      criteria: [
        'No failure is stated.',
        'A failure is implied but not explicit.',
        'A failure is explicitly stated.'
      ]
    }
  }
};

export const SYNTHETIC_RESPONSE: DecisionsWireResponse = {
  id: 'synthetic-not-a-live-response',
  model: 'typesafe/jev-1.13',
  provider: 'TypeSafe',
  answers: {
    plan: {
      type: 'choice',
      choice: 'grouped',
      confidence: 0.9,
      probabilities: {
        baseline: 0.06,
        grouped: 0.91,
        keep_baseline: 0.03
      }
    },
    keep_E1: {
      type: 'noul',
      noul: 0.06
    },
    relevance_E1: {
      type: 'score',
      score: 0.13,
      confidence: 0.85,
      probabilities: { '0': 0.9, '1': 0.07, '2': 0.03, '3': 0.0 }
    }
  },
  usage: { input_tokens: 1200, output_tokens: 0 }
};

export const SYNTHETIC_RESPONSE_MISSING_UNCERTAINTY: DecisionsWireResponse = {
  id: 'synthetic-missing-uncertainty',
  model: 'typesafe/jev-1.13',
  provider: 'TypeSafe',
  answers: {
    plan: { type: 'choice', choice: 'grouped' },
    keep_E1: { type: 'noul', noul: 0.06 },
    relevance_E1: {
      type: 'score',
      score: 0.13,
      confidence: 0.85,
      probabilities: { '0': 0.9, '1': 0.07, '2': 0.03, '3': 0.0 }
    }
  },
  usage: { input_tokens: 1200, output_tokens: 0 }
};

export function planningBundle(): DecisionBundle {
  const baseline: PlanCandidate = {
    id: 'baseline',
    summary: 'Execute both required review slices with two permitted workers.',
    sliceIds: ['S1', 'S2'],
    groups: [
      { id: 'G1', sliceIds: ['S1'], role: 'expert', effort: 'max' },
      { id: 'G2', sliceIds: ['S2'], role: 'expert', effort: 'max' }
    ],
    workerCount: 2,
    requiredVerificationIds: ['review_coverage']
  };
  const grouped: PlanCandidate = {
    id: 'grouped',
    summary: 'Execute both required review slices in one permitted worker group, preserving full coverage.',
    sliceIds: ['S1', 'S2'],
    groups: [{ id: 'G1', sliceIds: ['S1', 'S2'], role: 'expert', effort: 'max' }],
    workerCount: 1,
    requiredVerificationIds: ['review_coverage']
  };
  return buildDecisionBundle({
    projectId: 'p',
    workflowRunId: 'w',
    workflowRevision: 'r1',
    sourceDigest: 'source-a',
    graphDigest: 'graph-a',
    goal: 'Review pagination and serialization without modifying files. Cover both required slices.',
    planCandidates: [baseline, grouped],
    contextCandidates: [{
      id: 'E1',
      sourcePath: 'docs/old-demo.md',
      sourceHash: 'hash-e1',
      excerpt: 'The historical presentation used a green accent color.',
      pinned: false,
      fresh: true,
      reproducible: true
    }],
    baselinePlanId: 'baseline',
    requiredSliceIds: ['S1', 'S2'],
    requiredVerificationIds: ['review_coverage']
  });
}
