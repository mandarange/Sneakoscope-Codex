import path from 'node:path';
import { appendJsonlBounded, nowIso, readJson, readText, writeJsonAtomic, writeTextAtomic, exists } from './fsx.mjs';
import { OUTCOME_RUBRIC } from './proof-field.mjs';

export const RESEARCH_PAPER_ARTIFACT = 'research-paper.md';
export const RESEARCH_PAPER_SECTION_GROUPS = Object.freeze([
  ['abstract'],
  ['introduction'],
  ['method', 'methodology'],
  ['results', 'findings'],
  ['discussion'],
  ['limitations', 'falsification'],
  ['conclusion', 'next experiment'],
  ['references', 'sources']
]);

export const RESEARCH_SCOUT_COUNCIL = Object.freeze([
  {
    id: 'einstein',
    label: 'Einstein lens',
    role: 'first_principles_reframer',
    mandate: 'Reframe the problem around invariants, constraints, symmetry, and thought experiments.',
    required_outputs: ['eureka_moment', 'assumptions_to_remove', 'invariant_or_simplifying_frame', 'decisive_thought_experiment']
  },
  {
    id: 'feynman',
    label: 'Feynman lens',
    role: 'explanation_experimentalist',
    mandate: 'Reduce the idea to a teachable mechanism, toy example, and cheap empirical probe.',
    required_outputs: ['eureka_moment', 'plain_language_mechanism', 'toy_model', 'cheap_probe']
  },
  {
    id: 'turing',
    label: 'Turing lens',
    role: 'formalization_and_adversarial_cases',
    mandate: 'Formalize inputs, outputs, algorithms, computability limits, and adversarial countercases.',
    required_outputs: ['eureka_moment', 'formal_definition', 'algorithmic_shape', 'edge_or_adversarial_case']
  },
  {
    id: 'von_neumann',
    label: 'von Neumann lens',
    role: 'systems_strategy_scout',
    mandate: 'Map system dynamics, strategic incentives, scaling behavior, and worst-case interactions.',
    required_outputs: ['eureka_moment', 'system_model', 'strategic_or_scaling_risk', 'robustness_condition']
  },
  {
    id: 'skeptic',
    label: 'Skeptic lens',
    role: 'counterevidence_scout',
    mandate: 'Find disconfirming sources, replication risks, base-rate failures, and claims that should be weakened.',
    required_outputs: ['eureka_moment', 'counterevidence', 'base_rate_or_failure_mode', 'claim_to_downgrade']
  }
]);

export function createResearchPlan(prompt, opts = {}) {
  const depth = opts.depth || 'frontier';
  return {
    schema_version: 1,
    prompt,
    depth,
    created_at: nowIso(),
    methodology: 'genius-scout-council-frontier-discovery-loop',
    objective: 'Find the shortest useful mechanism that can be falsified or applied, grounded in maximum available source retrieval rather than broad summary.',
    outcome_rubric: OUTCOME_RUBRIC,
    research_council: {
      mode: 'persona_inspired_scouts_not_impersonation',
      policy: 'Use historical genius-inspired lenses as cognitive roles only. Do not claim to be, simulate private thoughts of, or speak as the real people.',
      effort_policy: {
        required_effort: 'xhigh',
        applies_to: 'every_research_scout_agent',
        rule: 'Every Research scout must run with xhigh reasoning effort; lower-effort scout findings cannot pass the research gate.'
      },
      eureka_policy: {
        exclamation: 'Eureka!',
        rule: 'Every scout must record one literal Eureka! moment with a non-obvious idea before debate.'
      },
      debate_policy: {
        mode: 'vigorous_evidence_bound_debate',
        rule: 'Every scout must challenge at least one other scout or respond to a challenge before synthesis.'
      },
      scouts: RESEARCH_SCOUT_COUNCIL,
      protocol: [
        'Each scout drafts independent search queries and provisional findings before synthesis.',
        'Each scout records effort=xhigh and one literal "Eureka!" idea before the council debate.',
        'The council runs a vigorous evidence-bound debate where every scout challenges or responds.',
        'The skeptic scout must run after the first four scouts and attack the strongest surviving claim.',
        'Synthesis may keep only claims with cited source-ledger ids, project evidence, or explicit hypothesis status.'
      ]
    },
    web_research_policy: {
      mode: 'maximum_source_retrieval',
      requirement: 'Use the broadest safe web/source search available in the runtime before synthesis.',
      query_sets: [
        'first-principles and theory sources',
        'plain-language explanations and empirical examples',
        'formal algorithms, definitions, or standards',
        'systems, strategy, scaling, or deployment evidence',
        'counterevidence, failures, critiques, and null results'
      ],
      source_priority: ['primary_sources', 'official_docs_or_standards', 'peer_reviewed_or_archival_sources', 'reputable_recent_sources', 'credible_counterevidence'],
      citation_rules: [
        'Every factual claim in the report must cite source-ledger ids or local project evidence.',
        'The final research paper must include references tied to source-ledger ids.',
        'Every novelty-ledger entry must cite at least one evidence source and at least one falsifier.',
        'If live web search is unavailable, record the blocker in source-ledger.json and keep research-gate.json unpassed.'
      ],
      minimums: {
        independent_scouts: RESEARCH_SCOUT_COUNCIL.length,
        web_search_passes: 1,
        source_entries: 1,
        counterevidence_sources: 1
      }
    },
    rules: [
      'Do not claim novelty without a novelty ledger entry.',
      'Separate facts, inferences, hypotheses, and speculations.',
      'Run the genius-lens scout council independently before synthesis.',
      'Every Research scout must run at reasoning_effort=xhigh, record one literal "Eureka!" idea, and participate in the debate.',
      'The scout council must debate vigorously but stay evidence-bound; record challenges and responses in debate-ledger.json.',
      'Maximize safe web/source search and record queries, sources, citations, and blockers in source-ledger.json.',
      'Actively seek disconfirming evidence before synthesis.',
      'Turn the surviving research result into research-paper.md with paper-style sections and references.',
      'Keep unsupported source-free claims as hypotheses only.',
      'Prefer the smallest testable mechanism or implementation probe over a new long-running loop.',
      'Do not ask the user mid-run; resolve scope using the research plan and safety policy.'
    ],
    phases: [
      { id: 'R0_FRAME', goal: 'Frame the target outcome, constraints, and what would make the idea useful.' },
      { id: 'R1_SOURCE_SEARCH', goal: 'Run maximum available web/source retrieval with independent query sets for each scout lens.' },
      { id: 'R2_EUREKA', goal: 'Have each xhigh genius-lens scout shout Eureka! and record one non-obvious idea with source ids.' },
      { id: 'R3_DEBATE', goal: 'Run a vigorous evidence-bound council debate with every scout challenging or responding.' },
      { id: 'R4_FALSIFY', goal: 'Attack each mechanism with counterexamples, missing evidence, source conflicts, and failure modes.' },
      { id: 'R5_APPLY', goal: 'Keep the smallest surviving mechanism, define a cheap probe, and write all ledgers.' },
      { id: 'R6_PAPER', goal: 'Convert the final research result into a concise paper manuscript with abstract, method, findings, limitations, and references.' }
    ],
    required_artifacts: [
      'research-report.md',
      RESEARCH_PAPER_ARTIFACT,
      'source-ledger.json',
      'scout-ledger.json',
      'debate-ledger.json',
      'novelty-ledger.json',
      'falsification-ledger.json',
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
  if (plan.research_council?.scouts?.length) {
    lines.push('## Genius Scout Council');
    lines.push(`Policy: ${plan.research_council.policy}`);
    for (const scout of plan.research_council.scouts) lines.push(`- ${scout.id}: ${scout.role} - ${scout.mandate}`);
    lines.push('');
  }
  if (plan.web_research_policy) {
    lines.push('## Web Research Policy');
    lines.push(`Mode: ${plan.web_research_policy.mode}`);
    lines.push(`Requirement: ${plan.web_research_policy.requirement}`);
    for (const querySet of plan.web_research_policy.query_sets || []) lines.push(`- query set: ${querySet}`);
    lines.push('');
  }
  lines.push('## Outcome Rubric');
  for (const item of plan.outcome_rubric || []) lines.push(`- ${item.id}: ${item.description}`);
  lines.push('');
  lines.push('## Phases');
  for (const phase of plan.phases) lines.push(`- ${phase.id}: ${phase.goal}`);
  lines.push('');
  lines.push('## Required Artifacts');
  for (const artifact of plan.required_artifacts) lines.push(`- ${artifact}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function countResearchPaperSections(text = '') {
  const headings = String(text || '').toLowerCase().split(/\n/).filter((line) => /^#{1,3}\s+/.test(line));
  return RESEARCH_PAPER_SECTION_GROUPS.filter((group) => headings.some((heading) => group.some((term) => heading.includes(term)))).length;
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
  await writeJsonAtomic(path.join(dir, 'source-ledger.json'), defaultSourceLedger(plan));
  await writeJsonAtomic(path.join(dir, 'scout-ledger.json'), defaultScoutLedger(plan));
  await writeJsonAtomic(path.join(dir, 'debate-ledger.json'), defaultDebateLedger(plan));
  await writeJsonAtomic(path.join(dir, 'falsification-ledger.json'), defaultFalsificationLedger());
  await writeJsonAtomic(path.join(dir, 'research-gate.json'), defaultResearchGate());
  await appendJsonlBounded(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'research.plan.created', depth: plan.depth });
  return plan;
}

export function defaultSourceLedger(plan = null) {
  return {
    schema_version: 1,
    policy: plan?.web_research_policy?.mode || 'maximum_source_retrieval',
    created_at: nowIso(),
    web_search_passes: 0,
    queries: [],
    sources: [],
    counterevidence_sources: [],
    citation_coverage: {
      all_key_claims_cited: false,
      notes: []
    },
    blockers: []
  };
}

export function defaultScoutLedger(plan = null) {
  const scouts = plan?.research_council?.scouts || RESEARCH_SCOUT_COUNCIL;
  return {
    schema_version: 1,
    council_mode: plan?.research_council?.mode || 'persona_inspired_scouts_not_impersonation',
    created_at: nowIso(),
    scouts: scouts.map((scout) => ({
      id: scout.id,
      role: scout.role,
      mandate: scout.mandate,
      effort: 'xhigh',
      eureka: {
        exclamation: 'Eureka!',
        idea: '',
        why_it_matters: '',
        source_ids: []
      },
      query_set: [],
      findings: [],
      falsifiers: [],
      cheap_probes: []
    })),
    synthesis: {
      surviving_claims: [],
      downgraded_claims: [],
      unresolved_conflicts: []
    }
  };
}

export function defaultDebateLedger(plan = null) {
  const scouts = plan?.research_council?.scouts || RESEARCH_SCOUT_COUNCIL;
  return {
    schema_version: 1,
    created_at: nowIso(),
    mode: 'vigorous_evidence_bound_debate',
    required_participants: scouts.map((scout) => scout.id),
    exchanges: [],
    synthesis_pressure: {
      strongest_disagreement: '',
      changed_minds: [],
      unresolved_conflicts: []
    }
  };
}

export function defaultFalsificationLedger() {
  return {
    schema_version: 1,
    created_at: nowIso(),
    cases: [],
    unresolved_failures: [],
    next_decisive_tests: []
  };
}

export function defaultResearchGate() {
  return {
    passed: false,
    report_present: false,
    paper_present: false,
    paper_sections: 0,
    source_ledger_present: false,
    scout_ledger_present: false,
    debate_ledger_present: false,
    novelty_ledger_present: false,
    falsification_ledger_present: false,
    web_search_policy: 'maximum_source_retrieval',
    web_search_passes: 0,
    source_entries: 0,
    independent_scouts: 0,
    xhigh_scouts: 0,
    eureka_moments: 0,
    scout_findings: 0,
    debate_participants: 0,
    debate_exchanges: 0,
    counterevidence_sources: 0,
    candidate_insights: 0,
    falsification_passes: 0,
    falsification_cases: 0,
    testable_predictions: 0,
    citation_coverage: false,
    web_search_blockers: [],
    unsafe_or_destructive_actions: false,
    unsupported_breakthrough_claims: 0,
    evidence: [],
    notes: []
  };
}

export async function evaluateResearchGate(dir) {
  const gate = await readJson(path.join(dir, 'research-gate.json'), defaultResearchGate());
  const reportPresent = await exists(path.join(dir, 'research-report.md'));
  const paperPresent = await exists(path.join(dir, RESEARCH_PAPER_ARTIFACT));
  const paperSections = paperPresent ? countResearchPaperSections(await readText(path.join(dir, RESEARCH_PAPER_ARTIFACT), '')) : 0;
  const sourcePresent = await exists(path.join(dir, 'source-ledger.json'));
  const scoutPresent = await exists(path.join(dir, 'scout-ledger.json'));
  const debatePresent = await exists(path.join(dir, 'debate-ledger.json'));
  const ledgerPresent = await exists(path.join(dir, 'novelty-ledger.json'));
  const falsificationPresent = await exists(path.join(dir, 'falsification-ledger.json'));
  const sourceLedger = await readJson(path.join(dir, 'source-ledger.json'), null);
  const scoutLedger = await readJson(path.join(dir, 'scout-ledger.json'), null);
  const debateLedger = await readJson(path.join(dir, 'debate-ledger.json'), null);
  const falsificationLedger = await readJson(path.join(dir, 'falsification-ledger.json'), null);
  const sourceEntries = Array.isArray(sourceLedger?.sources) ? sourceLedger.sources.length : 0;
  const counterEvidenceEntries = Array.isArray(sourceLedger?.counterevidence_sources) ? sourceLedger.counterevidence_sources.length : 0;
  const webSearchPasses = Math.max(Number(gate.web_search_passes || 0), Number(sourceLedger?.web_search_passes || 0));
  const scoutRows = Array.isArray(scoutLedger?.scouts) ? scoutLedger.scouts : [];
  const independentScouts = scoutRows.filter((scout) => Array.isArray(scout.findings) && scout.findings.length > 0).length;
  const xhighScouts = scoutRows.filter((scout) => scout.effort === 'xhigh').length;
  const eurekaMoments = scoutRows.filter((scout) => scout.eureka?.exclamation === 'Eureka!' && String(scout.eureka?.idea || '').trim()).length;
  const scoutFindings = scoutRows.reduce((sum, scout) => sum + (Array.isArray(scout.findings) ? scout.findings.length : 0), 0);
  const debateRows = Array.isArray(debateLedger?.exchanges) ? debateLedger.exchanges : [];
  const debateParticipants = new Set(debateRows.flatMap((exchange) => [exchange?.from, exchange?.to, ...(Array.isArray(exchange?.participants) ? exchange.participants : [])].filter(Boolean))).size;
  const debateExchanges = debateRows.length;
  const falsificationCases = Array.isArray(falsificationLedger?.cases) ? falsificationLedger.cases.length : 0;
  const searchBlockers = [
    ...(Array.isArray(gate.web_search_blockers) ? gate.web_search_blockers : []),
    ...(Array.isArray(sourceLedger?.blockers) ? sourceLedger.blockers : [])
  ].filter(Boolean);
  const citationCoverage = gate.citation_coverage === true || sourceLedger?.citation_coverage?.all_key_claims_cited === true;
  const reasons = [];
  if (!reportPresent && gate.report_present !== true) reasons.push('research_report_missing');
  if (!paperPresent) reasons.push('research_paper_missing');
  if (paperSections < RESEARCH_PAPER_SECTION_GROUPS.length) reasons.push('research_paper_sections_missing');
  if (!sourcePresent && gate.source_ledger_present !== true) reasons.push('source_ledger_missing');
  if (!scoutPresent && gate.scout_ledger_present !== true) reasons.push('scout_ledger_missing');
  if (!debatePresent && gate.debate_ledger_present !== true) reasons.push('debate_ledger_missing');
  if (!ledgerPresent && gate.novelty_ledger_present !== true) reasons.push('novelty_ledger_missing');
  if (!falsificationPresent && gate.falsification_ledger_present !== true) reasons.push('falsification_ledger_missing');
  if (webSearchPasses < 1) reasons.push('web_search_pass_missing');
  if (Math.max(Number(gate.source_entries || 0), sourceEntries) < 1) reasons.push('source_entry_missing');
  if (Math.max(Number(gate.independent_scouts || 0), independentScouts) < RESEARCH_SCOUT_COUNCIL.length) reasons.push('independent_scouts_missing');
  if (Math.max(Number(gate.xhigh_scouts || 0), xhighScouts) < RESEARCH_SCOUT_COUNCIL.length) reasons.push('scout_effort_not_xhigh');
  if (Math.max(Number(gate.eureka_moments || 0), eurekaMoments) < RESEARCH_SCOUT_COUNCIL.length) reasons.push('eureka_missing');
  if (Math.max(Number(gate.scout_findings || 0), scoutFindings) < 4) reasons.push('scout_findings_missing');
  if (Math.max(Number(gate.debate_participants || 0), debateParticipants) < RESEARCH_SCOUT_COUNCIL.length) reasons.push('debate_participants_missing');
  if (Math.max(Number(gate.debate_exchanges || 0), debateExchanges) < RESEARCH_SCOUT_COUNCIL.length) reasons.push('debate_exchanges_missing');
  if (Math.max(Number(gate.counterevidence_sources || 0), counterEvidenceEntries) < 1) reasons.push('counterevidence_source_missing');
  if ((gate.candidate_insights || 0) < 1) reasons.push('candidate_insight_missing');
  if ((gate.falsification_passes || 0) < 1) reasons.push('falsification_missing');
  if (Math.max(Number(gate.falsification_cases || 0), falsificationCases) < 1) reasons.push('falsification_case_missing');
  if ((gate.testable_predictions || 0) < 1) reasons.push('testable_prediction_missing');
  if (!citationCoverage) reasons.push('citation_coverage_missing');
  if (searchBlockers.length > 0) reasons.push('web_search_blocked');
  if (gate.unsafe_or_destructive_actions === true) reasons.push('unsafe_or_destructive_actions_present');
  if ((gate.unsupported_breakthrough_claims || 0) > 0) reasons.push('unsupported_breakthrough_claims_present');
  const result = {
    checked_at: nowIso(),
    passed: gate.passed === true && reasons.length === 0,
    reasons,
    metrics: {
      web_search_passes: webSearchPasses,
      paper_sections: Math.max(Number(gate.paper_sections || 0), paperSections),
      source_entries: Math.max(Number(gate.source_entries || 0), sourceEntries),
      independent_scouts: Math.max(Number(gate.independent_scouts || 0), independentScouts),
      xhigh_scouts: Math.max(Number(gate.xhigh_scouts || 0), xhighScouts),
      eureka_moments: Math.max(Number(gate.eureka_moments || 0), eurekaMoments),
      scout_findings: Math.max(Number(gate.scout_findings || 0), scoutFindings),
      debate_participants: Math.max(Number(gate.debate_participants || 0), debateParticipants),
      debate_exchanges: Math.max(Number(gate.debate_exchanges || 0), debateExchanges),
      counterevidence_sources: Math.max(Number(gate.counterevidence_sources || 0), counterEvidenceEntries),
      falsification_cases: Math.max(Number(gate.falsification_cases || 0), falsificationCases),
      citation_coverage: citationCoverage,
      web_search_blockers: searchBlockers.length
    },
    gate
  };
  await writeJsonAtomic(path.join(dir, 'research-gate.evaluated.json'), result);
  return result;
}

export async function writeMockResearchResult(dir, plan) {
  const sourceLedger = {
    schema_version: 1,
    policy: 'maximum_source_retrieval',
    created_at: nowIso(),
    mode: 'selftest_mock',
    web_search_passes: 1,
    queries: [
      { scout_id: 'einstein', query: 'mock first principles falsifiable novelty research mode', status: 'mocked' },
      { scout_id: 'feynman', query: 'mock simple experiment compare discovery prompt summary prompt', status: 'mocked' },
      { scout_id: 'turing', query: 'mock formal gate criteria source ledger citation coverage', status: 'mocked' },
      { scout_id: 'von_neumann', query: 'mock workflow gate scaling review route evidence', status: 'mocked' },
      { scout_id: 'skeptic', query: 'mock counterevidence research mode overclaims without sources', status: 'mocked' }
    ],
    sources: [
      {
        id: 'mock-source-1',
        kind: 'selftest',
        title: 'Mock SKS research source coverage',
        locator: 'writeMockResearchResult',
        accessed_at: nowIso(),
        supports: ['mock-insight-1'],
        notes: 'Selftest fixture; no live web call is made in --mock mode.'
      }
    ],
    counterevidence_sources: [
      {
        id: 'mock-counter-1',
        kind: 'selftest',
        title: 'Mock overclaim counterexample',
        locator: 'writeMockResearchResult',
        accessed_at: nowIso(),
        undermines: ['mock-insight-1'],
        notes: 'Shows the gate must fail if a run produces no tests or falsifiers.'
      }
    ],
    citation_coverage: {
      all_key_claims_cited: true,
      notes: ['mock report and novelty entry cite mock-source-1 and mock-counter-1']
    },
    blockers: []
  };
  const scoutLedger = {
    ...defaultScoutLedger(plan),
    scouts: RESEARCH_SCOUT_COUNCIL.map((scout) => ({
      id: scout.id,
      role: scout.role,
      mandate: scout.mandate,
      effort: 'xhigh',
      eureka: {
        exclamation: 'Eureka!',
        idea: `${scout.label} spots a non-obvious, testable angle for ${plan.prompt}.`,
        why_it_matters: 'It forces the run to produce one falsifiable idea before synthesis.',
        source_ids: ['mock-source-1']
      },
      query_set: sourceLedger.queries.filter((query) => query.scout_id === scout.id).map((query) => query.query),
      findings: [
        {
          id: `mock-${scout.id}-finding-1`,
          claim: `${scout.label} supports a source-cited, falsifiable research gate for ${plan.prompt}.`,
          source_ids: ['mock-source-1'],
          status: 'mock_supported'
        }
      ],
      falsifiers: ['A run without cited sources, counterevidence, or cheap probes should fail the research gate.'],
      cheap_probes: ['Compare discovery-loop output against a summary-only baseline and count testable insights.']
    })),
    synthesis: {
      surviving_claims: ['mock-insight-1'],
      downgraded_claims: [],
      unresolved_conflicts: []
    }
  };
  const debateLedger = {
    schema_version: 1,
    created_at: nowIso(),
    mode: 'vigorous_evidence_bound_debate',
    required_participants: RESEARCH_SCOUT_COUNCIL.map((scout) => scout.id),
    exchanges: [
      { id: 'mock-debate-1', from: 'einstein', to: 'feynman', stance: 'challenge', claim: 'A toy probe is not enough unless it preserves the invariant.', source_ids: ['mock-source-1'] },
      { id: 'mock-debate-2', from: 'feynman', to: 'turing', stance: 'challenge', claim: 'A formal gate must still be explainable as a cheap experiment.', source_ids: ['mock-source-1'] },
      { id: 'mock-debate-3', from: 'turing', to: 'von_neumann', stance: 'challenge', claim: 'The system model needs explicit inputs, outputs, and adversarial cases.', source_ids: ['mock-source-1'] },
      { id: 'mock-debate-4', from: 'von_neumann', to: 'skeptic', stance: 'response', claim: 'A scaling risk survives only if the skeptic cannot find a base-rate failure.', source_ids: ['mock-counter-1'] },
      { id: 'mock-debate-5', from: 'skeptic', to: 'einstein', stance: 'challenge', claim: 'The invariant must be downgraded if no counterevidence source is recorded.', source_ids: ['mock-counter-1'] }
    ],
    synthesis_pressure: {
      strongest_disagreement: 'Whether a falsifiable novelty gate should optimize for formal criteria or cheap experiments first.',
      changed_minds: ['mock council accepted citation coverage as a gate, not a report afterthought'],
      unresolved_conflicts: []
    }
  };
  const falsificationLedger = {
    schema_version: 1,
    created_at: nowIso(),
    cases: [
      {
        id: 'mock-falsification-1',
        target_claim: 'A research run is useful if it produces falsifiable novelty.',
        attack: 'The claim fails if the output only summarizes background material or has no decisive probe.',
        source_ids: ['mock-counter-1'],
        result: 'survives_with_gate_requirement',
        next_decisive_test: 'Score testable insight count against a summary-only baseline.'
      }
    ],
    unresolved_failures: [],
    next_decisive_tests: ['Run paired prompt comparison and measure cited testable insights.']
  };
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
        evidence: ['mock-source-1', 'mock run executed the genius-scout discovery phases'],
        falsifiers: ['If the output contains no competing hypotheses or tests, the method failed.'],
        next_experiment: 'Run the same topic through summary-only and discovery-loop prompts, then compare testable insight count.'
      }
    ]
  };
  await writeJsonAtomic(path.join(dir, 'source-ledger.json'), sourceLedger);
  await writeJsonAtomic(path.join(dir, 'scout-ledger.json'), scoutLedger);
  await writeJsonAtomic(path.join(dir, 'debate-ledger.json'), debateLedger);
  await writeJsonAtomic(path.join(dir, 'falsification-ledger.json'), falsificationLedger);
  await writeJsonAtomic(path.join(dir, 'novelty-ledger.json'), ledger);
  await writeTextAtomic(path.join(dir, 'research-report.md'), `# SKS Research Report\n\nPrompt: ${plan.prompt}\n\n## Scout Council Synthesis\n\nThe mock council keeps one cited methodological insight: a research mode should force falsifiable novelty rather than summarize known material [mock-source-1].\n\n## Source Coverage\n\nThis is a selftest fixture. It records mock source and counterevidence ledgers but does not perform live web browsing in --mock mode.\n\n## Candidate Insight\n\nA useful research run must produce source-cited, falsifiable novelty with scout findings and a cheap probe.\n\n## Falsification\n\nThe claim is weak if no new testable prediction, counterevidence source, or experiment is produced [mock-counter-1].\n\n## Next Test\n\nCompare this mode against a summary-only run and score candidate insights, falsification passes, citation coverage, and testability.\n`);
  await writeTextAtomic(path.join(dir, RESEARCH_PAPER_ARTIFACT), `# Research Paper: ${plan.prompt}\n\n## Abstract\nA source-cited research run should produce falsifiable novelty rather than only summarize known material.\n\n## Introduction\nThe mock topic is evaluated as a research workflow outcome [mock-source-1].\n\n## Methodology\nFive xhigh scouts produce Eureka ideas, debate, and falsify the strongest claim.\n\n## Findings\nThe surviving finding is that useful research needs cited novelty plus a cheap decisive probe.\n\n## Discussion\nThe debate favors gate-backed evidence over narrative confidence.\n\n## Limitations and Falsification\nThe claim fails without sources, counterevidence, or testable predictions [mock-counter-1].\n\n## Conclusion and Next Experiment\nCompare this loop against a summary-only baseline and score testable insights.\n\n## References\n- [mock-source-1] Mock SKS research source coverage.\n- [mock-counter-1] Mock overclaim counterexample.\n`);
  await writeJsonAtomic(path.join(dir, 'research-gate.json'), {
    ...defaultResearchGate(),
    passed: true,
    report_present: true,
    paper_present: true,
    paper_sections: RESEARCH_PAPER_SECTION_GROUPS.length,
    source_ledger_present: true,
    scout_ledger_present: true,
    debate_ledger_present: true,
    novelty_ledger_present: true,
    falsification_ledger_present: true,
    web_search_passes: 1,
    source_entries: 1,
    independent_scouts: RESEARCH_SCOUT_COUNCIL.length,
    xhigh_scouts: RESEARCH_SCOUT_COUNCIL.length,
    eureka_moments: RESEARCH_SCOUT_COUNCIL.length,
    scout_findings: RESEARCH_SCOUT_COUNCIL.length,
    debate_participants: RESEARCH_SCOUT_COUNCIL.length,
    debate_exchanges: debateLedger.exchanges.length,
    counterevidence_sources: 1,
    candidate_insights: 1,
    falsification_passes: 1,
    falsification_cases: 1,
    testable_predictions: 1,
    citation_coverage: true,
    evidence: ['mock research report', 'mock research paper', 'mock source ledger', 'mock scout ledger', 'mock debate ledger', 'mock novelty ledger', 'mock falsification ledger'],
    notes: ['mock mode records the new contract but does not call a model or perform live web browsing']
  });
  return evaluateResearchGate(dir);
}

export function buildResearchPrompt({ id, mission, plan, cycle, previous }) {
  return `You are running SKS Research Mode.\nMISSION: ${id}\nTOPIC: ${mission.prompt}\nCYCLE: ${cycle}\nMODE: Genius Scout Council + frontier discovery loop. Use maximum reasoning depth available under the current Codex profile.\nNO-QUESTION LOCK: Do not ask the user. Resolve scope from research-plan.json and current project evidence.\nSAFETY: Destructive database operations and unsafe external actions are forbidden. Prefer read-only inspection, local files, and cited public sources.\nPERSONA POLICY: Use Einstein/Feynman/Turing/von Neumann-inspired scout lenses only as cognitive roles. Do not impersonate, roleplay private identity, or speak as the historical people.\nSCOUT EFFORT POLICY: Every Research scout agent must use reasoning_effort=xhigh. Record effort: "xhigh" for every scout in scout-ledger.json. Any lower-effort scout output must keep research-gate.json unpassed.\nEUREKA POLICY: Every scout must literally write "Eureka!" and one non-obvious, source-linked idea before debate.\nDEBATE POLICY: The scouts must debate vigorously but stay evidence-bound. Every scout must challenge or respond at least once, and debate-ledger.json must record the exchanges before synthesis.\nPAPER POLICY: After the report and ledgers, write research-paper.md as a concise manuscript with Abstract, Introduction, Methodology, Findings/Results, Discussion, Limitations/Falsification, Conclusion/Next Experiment, and References.\nWEB/SOURCE POLICY: Run the broadest safe web/source search available in this runtime before synthesis. Use independent query sets for every scout. Prefer primary sources, official docs or standards, peer-reviewed or archival sources, reputable recent sources, and credible counterevidence. If live web search is unavailable, record the blocker in source-ledger.json and do not pass the gate.\nRESEARCH PLAN:\n${JSON.stringify(plan, null, 2)}\n\nOBJECTIVE: Produce genuinely useful candidate discoveries: non-obvious hypotheses, mechanisms, predictions, or experiments. Do not merely summarize. Mark uncertainty clearly.\n\nREQUIRED PROCESS:\n1. Source search first: create source-ledger.json with queries, source ids, counterevidence sources, citation coverage, and blockers.\n2. Independent xhigh scouts: create scout-ledger.json with effort=xhigh, a literal Eureka! idea, findings, source_ids, falsifiers, and cheap_probes for every scout lens.\n3. Debate: create debate-ledger.json with evidence-bound challenge/response exchanges involving every scout before synthesis.\n4. Falsification: create falsification-ledger.json with attacks, missing evidence, source conflicts, and decisive next tests.\n5. Synthesis: write research-report.md and novelty-ledger.json only after cited scout findings, Eureka ideas, debate, and falsification are recorded.\n6. Paper: write research-paper.md as a paper-style manuscript with source-ledger references and limitations.\n\nREQUIRED OUTPUT FILES in .sneakoscope/missions/${id}/:\n- research-report.md: concise report with framing, source coverage, scout synthesis, debate synthesis, hypotheses, falsification, predictions, and next experiments. Cite source-ledger ids for factual claims.\n- research-paper.md: paper manuscript with Abstract, Introduction, Methodology, Findings/Results, Discussion, Limitations/Falsification, Conclusion/Next Experiment, and References using source-ledger ids.\n- source-ledger.json: web/source queries, source ids, source priority, counterevidence sources, citation coverage, and blockers.\n- scout-ledger.json: one entry per scout lens with effort, eureka, query_set, findings, source_ids, falsifiers, and cheap_probes.\n- debate-ledger.json: evidence-bound challenge/response exchanges, participants, changed minds, and unresolved conflicts.\n- novelty-ledger.json: entries with claim, novelty, confidence, falsifiability, evidence source ids, falsifiers, next_experiment.\n- falsification-ledger.json: attacks/counterexamples/source conflicts, result, and next_decisive_tests.\n- research-gate.json: set passed only when all ledgers exist, research-paper.md exists with required paper sections, web/source retrieval was attempted, all scouts have effort=xhigh, all scouts have literal Eureka! ideas, every scout participated in debate, at least one counterevidence source exists, citation coverage is complete, at least one insight survived falsification, at least one testable prediction exists, and unsupported breakthrough claims are zero.\n\nPrevious cycle tail:\n${String(previous || '').slice(-2500)}\n`;
}
