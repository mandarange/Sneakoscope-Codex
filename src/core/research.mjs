import path from 'node:path';
import { appendJsonlBounded, nowIso, readJson, writeJsonAtomic, writeTextAtomic, exists } from './fsx.mjs';

export function createResearchPlan(prompt, opts = {}) {
  const depth = opts.depth || 'frontier';
  return {
    schema_version: 1,
    prompt,
    depth,
    created_at: nowIso(),
    methodology: 'frontier-discovery-loop',
    objective: 'Find non-obvious, testable insights or hypotheses, not a summary.',
    rules: [
      'Do not claim novelty without a novelty ledger entry.',
      'Separate facts, inferences, hypotheses, and speculations.',
      'Actively seek disconfirming evidence before synthesis.',
      'Prefer testable mechanisms, predictions, or experiments over vague ideas.',
      'Keep raw notes bounded; summarize claims and evidence into structured files.',
      'Do not ask the user mid-run; resolve scope using the research plan and safety policy.'
    ],
    phases: [
      { id: 'R0_FRAME', goal: 'Frame the research question, assumptions, constraints, and what would count as a discovery.' },
      { id: 'R1_MAP', goal: 'Map the nearby concept space, known baselines, and hidden assumptions.' },
      { id: 'R2_DIVERGE', goal: 'Generate multiple competing hypotheses across mechanisms, analogies, edge cases, and failure modes.' },
      { id: 'R3_FALSIFY', goal: 'Attack each hypothesis with counterexamples, missing evidence, and alternative explanations.' },
      { id: 'R4_SYNTHESIZE', goal: 'Combine surviving pieces into new candidate insights with explicit causal stories.' },
      { id: 'R5_TEST', goal: 'Design cheap experiments, predictions, or implementation probes that could validate or refute the insight.' },
      { id: 'R6_LEDGER', goal: 'Write novelty, confidence, evidence, falsifiers, and next-step status to the ledger.' }
    ],
    required_artifacts: [
      'research-report.md',
      'novelty-ledger.json',
      'research-gate.json'
    ]
  };
}

export function researchPlanMarkdown(plan) {
  const lines = [];
  lines.push('# SKS Research Plan');
  lines.push('');
  lines.push(`Prompt: ${plan.prompt}`);
  lines.push(`Depth: ${plan.depth}`);
  lines.push(`Methodology: ${plan.methodology}`);
  lines.push('');
  lines.push('## Rules');
  for (const rule of plan.rules) lines.push(`- ${rule}`);
  lines.push('');
  lines.push('## Phases');
  for (const phase of plan.phases) lines.push(`- ${phase.id}: ${phase.goal}`);
  lines.push('');
  lines.push('## Required Artifacts');
  for (const artifact of plan.required_artifacts) lines.push(`- ${artifact}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export async function writeResearchPlan(dir, prompt, opts = {}) {
  const plan = createResearchPlan(prompt, opts);
  await writeJsonAtomic(path.join(dir, 'research-plan.json'), plan);
  await writeTextAtomic(path.join(dir, 'research-plan.md'), researchPlanMarkdown(plan));
  await writeJsonAtomic(path.join(dir, 'novelty-ledger.json'), {
    schema_version: 1,
    entries: [],
    rubric: {
      novelty: '0 known/restatement, 1 local reframing, 2 useful synthesis, 3 non-obvious testable insight',
      confidence: '0 speculation, 1 weak, 2 supported, 3 strongly supported',
      falsifiability: '0 vague, 1 indirectly testable, 2 directly testable, 3 cheap decisive test exists'
    }
  });
  await writeJsonAtomic(path.join(dir, 'research-gate.json'), defaultResearchGate());
  await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'research.plan.created', depth: plan.depth });
  return plan;
}

export function defaultResearchGate() {
  return {
    passed: false,
    report_present: false,
    novelty_ledger_present: false,
    candidate_insights: 0,
    falsification_passes: 0,
    testable_predictions: 0,
    unsafe_or_destructive_actions: false,
    unsupported_breakthrough_claims: 0,
    evidence: [],
    notes: []
  };
}

export async function evaluateResearchGate(dir) {
  const gate = await readJson(path.join(dir, 'research-gate.json'), defaultResearchGate());
  const reportPresent = await exists(path.join(dir, 'research-report.md'));
  const ledgerPresent = await exists(path.join(dir, 'novelty-ledger.json'));
  const reasons = [];
  if (!reportPresent && gate.report_present !== true) reasons.push('research_report_missing');
  if (!ledgerPresent && gate.novelty_ledger_present !== true) reasons.push('novelty_ledger_missing');
  if ((gate.candidate_insights || 0) < 1) reasons.push('candidate_insight_missing');
  if ((gate.falsification_passes || 0) < 1) reasons.push('falsification_missing');
  if ((gate.testable_predictions || 0) < 1) reasons.push('testable_prediction_missing');
  if (gate.unsafe_or_destructive_actions === true) reasons.push('unsafe_or_destructive_actions_present');
  if ((gate.unsupported_breakthrough_claims || 0) > 0) reasons.push('unsupported_breakthrough_claims_present');
  const result = { checked_at: nowIso(), passed: gate.passed === true && reasons.length === 0, reasons, gate };
  await writeJsonAtomic(path.join(dir, 'research-gate.evaluated.json'), result);
  return result;
}

export async function writeMockResearchResult(dir, plan) {
  const ledger = {
    schema_version: 1,
    entries: [
      {
        id: 'mock-insight-1',
        claim: 'A useful research run must optimize for falsifiable novelty, not only breadth of summary.',
        type: 'methodological_insight',
        novelty: 2,
        confidence: 2,
        falsifiability: 2,
        evidence: ['mock run executed the frontier-discovery-loop phases'],
        falsifiers: ['If the output contains no competing hypotheses or tests, the method failed.'],
        next_experiment: 'Run the same topic through summary-only and discovery-loop prompts, then compare testable insight count.'
      }
    ]
  };
  await writeJsonAtomic(path.join(dir, 'novelty-ledger.json'), ledger);
  await writeTextAtomic(path.join(dir, 'research-report.md'), `# SKS Research Report\n\nPrompt: ${plan.prompt}\n\n## Candidate Insight\n\nA research mode should force the model to produce falsifiable novelty rather than summarize known material.\n\n## Falsification\n\nThe claim is weak if no new testable prediction or experiment is produced.\n\n## Next Test\n\nCompare this mode against a summary-only run and score candidate insights, falsification passes, and testability.\n`);
  await writeJsonAtomic(path.join(dir, 'research-gate.json'), {
    ...defaultResearchGate(),
    passed: true,
    report_present: true,
    novelty_ledger_present: true,
    candidate_insights: 1,
    falsification_passes: 1,
    testable_predictions: 1,
    evidence: ['mock research report', 'mock novelty ledger'],
    notes: ['mock mode does not call a model']
  });
  return evaluateResearchGate(dir);
}

export function buildResearchPrompt({ id, mission, plan, cycle, previous }) {
  return `You are running SKS Research Mode.\nMISSION: ${id}\nTOPIC: ${mission.prompt}\nCYCLE: ${cycle}\nMODE: Frontier discovery loop. Use maximum reasoning depth available under the current Codex profile.\nNO-QUESTION LOCK: Do not ask the user. Resolve scope from research-plan.json and current project evidence.\nSAFETY: Destructive database operations and unsafe external actions are forbidden. Prefer read-only inspection and local files.\nRESEARCH PLAN:\n${JSON.stringify(plan, null, 2)}\n\nOBJECTIVE: Produce genuinely useful candidate discoveries: non-obvious hypotheses, mechanisms, predictions, or experiments. Do not merely summarize. Mark uncertainty clearly.\n\nREQUIRED OUTPUT FILES in .sneakoscope/missions/${id}/:\n- research-report.md: concise report with framing, hypotheses, falsification, synthesis, predictions, and next experiments.\n- novelty-ledger.json: entries with claim, novelty, confidence, falsifiability, evidence, falsifiers, next_experiment.\n- research-gate.json: set passed only when report and ledger exist, at least one candidate insight survived falsification, at least one testable prediction exists, and unsupported breakthrough claims are zero.\n\nPrevious cycle tail:\n${String(previous || '').slice(-2500)}\n`;
}
