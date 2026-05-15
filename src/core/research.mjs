import path from 'node:path';
import { appendJsonlBounded, nowIso, readJson, readText, writeJsonAtomic, writeTextAtomic, exists } from './fsx.mjs';
import { OUTCOME_RUBRIC } from './proof-field.mjs';
import { RESEARCH_SCOUT_PERSONA_CONTRACT, validateResearchScoutPersonas } from './recallpulse.mjs';

export const RESEARCH_PAPER_ARTIFACT = 'research-paper.md';
export const RESEARCH_SOURCE_SKILL_ARTIFACT = 'research-source-skill.md';
export const RESEARCH_GENIUS_SUMMARY_ARTIFACT = 'genius-opinion-summary.md';
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

function cleanResearchArtifactDate(value = '') {
  const match = String(value || '').match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : nowIso().slice(0, 10);
}

function researchTitleSlug(prompt = '') {
  const cleaned = String(prompt || '')
    .normalize('NFKC')
    .replace(/[`"'<>]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  const slug = cleaned.split('-').filter(Boolean).slice(0, 10).join('-').slice(0, 90).replace(/-+$/g, '');
  return slug || 'research';
}

export function researchPaperArtifactName(prompt = '', createdAt = nowIso(), opts = {}) {
  const titleSource = opts.title || opts.paperTitle || prompt;
  return `${cleanResearchArtifactDate(createdAt)}-${researchTitleSlug(titleSource)}-research-paper.md`;
}

export function isDatedResearchPaperArtifact(name = '') {
  return /^\d{4}-\d{2}-\d{2}-[^\s/\\]+-research-paper\.md$/u.test(String(name || ''));
}

export function researchPaperArtifactForPlan(plan = null) {
  const artifact = plan?.artifacts?.research_paper || plan?.paper_artifact;
  return artifact ? path.basename(String(artifact)) : RESEARCH_PAPER_ARTIFACT;
}

export async function findResearchPaperArtifact(dir, plan = null, opts = {}) {
  const preferred = researchPaperArtifactForPlan(plan);
  const allowLegacyFallback = opts.allowLegacyFallback === true || preferred === RESEARCH_PAPER_ARTIFACT;
  const names = [...new Set([preferred, allowLegacyFallback ? RESEARCH_PAPER_ARTIFACT : null].filter(Boolean))];
  for (const name of names) {
    const file = path.join(dir, name);
    if (await exists(file)) return { name, path: file, exists: true, preferred: name === preferred, legacy: name === RESEARCH_PAPER_ARTIFACT };
  }
  return { name: preferred, path: path.join(dir, preferred), exists: false, preferred: true, legacy: false };
}

export function researchScoutAgentName(scout = {}) {
  return String(scout.agent_name || scout.display_name || scout.label || scout.id || 'Research Scout').trim();
}

export const RESEARCH_SCOUT_COUNCIL = Object.freeze(RESEARCH_SCOUT_PERSONA_CONTRACT.map((scout) => {
  const displayName = scout.display_name || scout.label || scout.id;
  return Object.freeze({
    ...scout,
    display_name: displayName,
    label: displayName,
    agent_name: displayName,
    codex_agent_name: displayName,
    required_outputs: scout.required_outputs
  });
}));

export const RESEARCH_SOURCE_LAYERS = Object.freeze([
  {
    id: 'academic_literature',
    label: 'Academic literature',
    purpose: 'Find recent papers, preprints, formal reviews, citations, and open scholarly metadata before synthesis.',
    evidence_role: 'formal_evidence',
    examples: ['arXiv', 'Semantic Scholar', 'OpenAlex', 'Crossref', 'PubMed'],
    query_templates: ['"<topic>" arxiv', '"<topic>" site:semanticscholar.org', '"<topic>" OpenAlex Crossref PubMed']
  },
  {
    id: 'official_government_data',
    label: 'Official government and leading-institution knowledge',
    purpose: 'Ground claims in public datasets, policy papers, national statistics, and leading-country institutional sources.',
    evidence_role: 'authoritative_baseline',
    examples: ['World Bank', 'OECD', 'Eurostat', 'data.gov', 'data.gov.uk', 'NIST'],
    query_templates: ['"<topic>" site:worldbank.org OR site:oecd.org', '"<topic>" site:data.gov OR site:data.gov.uk', '"<topic>" site:nist.gov']
  },
  {
    id: 'standards_primary_docs',
    label: 'Standards and primary documents',
    purpose: 'Check primary specifications, standards, RFCs, policy originals, and official project documents before relying on summaries.',
    evidence_role: 'primary_source',
    examples: ['IETF RFCs', 'W3C', 'ISO abstracts', 'official standards bodies', 'project primary docs'],
    query_templates: ['"<topic>" RFC standard specification', '"<topic>" W3C IETF NIST standard', '"<topic>" official specification']
  },
  {
    id: 'news_current_events',
    label: 'Current news and global reporting',
    purpose: 'Capture recent events, public impact, and regional framing from reputable news and global news indices.',
    evidence_role: 'recency_signal',
    examples: ['GDELT', 'BBC', 'CNN', 'Reuters', 'AP', 'regional reputable outlets'],
    query_templates: ['"<topic>" BBC CNN latest', '"<topic>" GDELT news', '"<topic>" Reuters AP analysis']
  },
  {
    id: 'public_discourse',
    label: 'Public discourse',
    purpose: 'Sample public practitioner and community discourse without treating popularity as truth.',
    evidence_role: 'sentiment_and_edge_cases',
    examples: ['X/Twitter recent search', 'Reddit', 'Hacker News', 'public forums'],
    query_templates: ['"<topic>" site:x.com OR site:twitter.com', '"<topic>" site:reddit.com', '"<topic>" "Hacker News"']
  },
  {
    id: 'developer_practitioner',
    label: 'Developer and practitioner knowledge',
    purpose: 'Find implementation pitfalls, developer questions, bug reports, and operational lessons.',
    evidence_role: 'practice_feedback',
    examples: ['Stack Overflow', 'Stack Exchange', 'GitHub issues', 'release notes', 'engineering blogs'],
    query_templates: ['"<topic>" site:stackoverflow.com', '"<topic>" site:stackexchange.com', '"<topic>" site:github.com issues']
  },
  {
    id: 'counterevidence_factcheck',
    label: 'Counterevidence and fact-checking',
    purpose: 'Actively search for failures, critiques, null results, retractions, fact checks, and source conflicts.',
    evidence_role: 'falsification',
    examples: ['Google Fact Check Tools', 'Retraction Watch', 'critical reviews', 'benchmark failures', 'negative results'],
    query_templates: ['"<topic>" critique failure limitation', '"<topic>" fact check retraction', '"<topic>" counterevidence null result']
  }
]);

export const RESEARCH_SOURCE_LAYER_IDS = Object.freeze(RESEARCH_SOURCE_LAYERS.map((layer) => layer.id));

export function createResearchPlan(prompt, opts = {}) {
  const depth = opts.depth || 'frontier';
  const createdAt = nowIso();
  const paperArtifact = researchPaperArtifactName(prompt, createdAt, opts);
  return {
    schema_version: 1,
    prompt,
    depth,
    created_at: createdAt,
    methodology: 'genius-scout-council-frontier-discovery-loop',
    paper_artifact: paperArtifact,
    artifacts: {
      research_paper: paperArtifact,
      legacy_research_paper: RESEARCH_PAPER_ARTIFACT,
      genius_opinion_summary: RESEARCH_GENIUS_SUMMARY_ARTIFACT,
      research_source_skill: RESEARCH_SOURCE_SKILL_ARTIFACT
    },
    objective: 'Find the shortest useful mechanism that can be falsified or applied, grounded in maximum available source retrieval rather than broad summary.',
    execution_policy: {
      normal_run: 'real_long_running_research_until_unanimous_scout_consensus',
      default_cycle_timeout_minutes: 120,
      default_max_cycles: 12,
      safety_cap: 'Research repeats scout/debate/falsification cycles until unanimous scout consensus or an explicit max-cycle safety cap pauses the run.',
      mock_policy: '--mock is for selftests and dry harness checks only; normal Research must block rather than silently substitute mock output.'
    },
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
        mode: 'vigorous_evidence_bound_debate_until_unanimous_consensus',
        rule: 'Every scout must challenge at least one other scout or respond to a challenge before synthesis. The loop repeats until every scout records final agreement on the surviving mechanism or the safety cap pauses the run with an unpassed gate.'
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
      mode: 'layered_source_retrieval_and_triangulation',
      requirement: 'Use every safely available public web/source route before synthesis, separated into source layers so the final claim is not dominated by one corpus or platform.',
      query_sets: [
        'first-principles and theory sources',
        'plain-language explanations and empirical examples',
        'formal algorithms, definitions, or standards',
        'systems, strategy, scaling, or deployment evidence',
        'counterevidence, failures, critiques, and null results'
      ],
      source_layers: RESEARCH_SOURCE_LAYERS,
      source_priority: ['primary_sources', 'official_docs_or_standards', 'peer_reviewed_or_archival_sources', 'reputable_recent_sources', 'credible_counterevidence'],
      skill_creator: {
        artifact: RESEARCH_SOURCE_SKILL_ARTIFACT,
        status: 'route_local_candidate',
        rule: 'Before source gathering, create a route-local source collection skill that names the selected layers, query families, source-quality fields, blockers, and cross-layer triangulation checks. Do not edit generated .agents/skills during a research run.'
      },
      citation_rules: [
        'Every factual claim in the report must cite source-ledger ids or local project evidence.',
        'The final research paper must include references tied to source-ledger ids.',
        'Every required source layer must have at least one cited source or an explicit blocker; blockers keep the research gate unpassed.',
        'The source-ledger must include at least one cross-layer triangulation check comparing formal, current, discourse, practitioner, official, and counterevidence sources.',
        'Every novelty-ledger entry must cite at least one evidence source and at least one falsifier.',
        'If live web search is unavailable, record the blocker in source-ledger.json and keep research-gate.json unpassed.'
      ],
      minimums: {
        independent_scouts: RESEARCH_SCOUT_COUNCIL.length,
        web_search_passes: 1,
        source_entries: 1,
        source_layers: RESEARCH_SOURCE_LAYER_IDS.length,
        counterevidence_sources: 1,
        triangulation_checks: 1
      }
    },
    mutation_policy: {
      implementation_allowed: false,
      allowed_write_scope: 'route-local mission artifacts only',
      rule: 'Normal Research must not modify repository source, package, docs, config, or generated harness files. It may write only artifacts under its own .sneakoscope/missions/<mission-id>/ directory.'
    },
    artifact_policy: {
      research_paper: paperArtifact,
      rule: 'Write the final manuscript to the dated topic-specific research_paper artifact from this plan, not the legacy generic filename.'
    },
    rules: [
      'Do not modify code or project source files during Research. Research writes only route-local mission artifacts; implementation belongs to $Team or another execution route.',
      'Do not claim novelty without a novelty ledger entry.',
      'Separate facts, inferences, hypotheses, and speculations.',
      'Run the genius-lens scout council independently before synthesis.',
      'Every Research scout must run at reasoning_effort=xhigh, record one literal "Eureka!" idea, and participate in the debate.',
      'The scout council must debate vigorously but stay evidence-bound; record challenges and responses in debate-ledger.json. Continue cycles until unanimous_consensus=true with every scout agreeing.',
      'Maximize safe web/source search as layered source retrieval and record queries, source layers, citations, quality notes, triangulation checks, and blockers in source-ledger.json.',
      `Create ${RESEARCH_SOURCE_SKILL_ARTIFACT} as a route-local source collection skill before synthesis; do not edit generated .agents/skills during the research run.`,
      'Actively seek disconfirming evidence before synthesis.',
      `Turn the surviving research result into ${paperArtifact} with paper-style sections and references.`,
      `End every run with ${RESEARCH_GENIUS_SUMMARY_ARTIFACT}, summarizing each genius-lens scout's final opinion, strongest evidence, disagreement, and changed mind.`,
      'Keep unsupported source-free claims as hypotheses only.',
      'Prefer the smallest testable mechanism or implementation probe, but do not stop source gathering early for speed when the research question needs a longer pass.',
      'Do not ask the user mid-run; resolve scope using the research plan and safety policy.'
    ],
    phases: [
      { id: 'R0_FRAME', goal: 'Frame the target outcome, constraints, and what would make the idea useful.' },
      { id: 'R1_SOURCE_SKILL', goal: `Create ${RESEARCH_SOURCE_SKILL_ARTIFACT} with layer-specific search routes, quality fields, and blockers before source gathering.` },
      { id: 'R2_SOURCE_SEARCH', goal: 'Run layered web/source retrieval across papers, official data, standards, news, public discourse, developer knowledge, and counterevidence.' },
      { id: 'R3_EUREKA', goal: 'Have each xhigh genius-lens scout shout Eureka! and record one non-obvious idea with source ids.' },
      { id: 'R4_DEBATE', goal: 'Run a vigorous evidence-bound council debate with every scout challenging or responding; repeat until unanimous scout consensus is recorded.' },
      { id: 'R5_FALSIFY', goal: 'Attack each mechanism with counterexamples, missing evidence, source conflicts, and failure modes.' },
      { id: 'R6_APPLY', goal: 'Keep the smallest surviving mechanism, define a cheap probe, and write all ledgers.' },
      { id: 'R7_PAPER', goal: 'Convert the final research result into a concise paper manuscript with abstract, method, findings, limitations, and references.' },
      { id: 'R8_GENIUS_SUMMARY', goal: `Write ${RESEARCH_GENIUS_SUMMARY_ARTIFACT} so the final answer can report every scout lens opinion and the council consensus.` }
    ],
    required_artifacts: [
      'research-report.md',
      paperArtifact,
      RESEARCH_GENIUS_SUMMARY_ARTIFACT,
      RESEARCH_SOURCE_SKILL_ARTIFACT,
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
  lines.push(`Research paper: ${researchPaperArtifactForPlan(plan)}`);
  if (plan.execution_policy) {
    lines.push(`Execution: ${plan.execution_policy.normal_run}; default cycle timeout ${plan.execution_policy.default_cycle_timeout_minutes} minutes`);
    if (plan.execution_policy.default_max_cycles) lines.push(`Consensus loop: repeat until unanimous scout consensus; default safety cap ${plan.execution_policy.default_max_cycles} cycles`);
    lines.push(`Mock policy: ${plan.execution_policy.mock_policy}`);
  }
  if (plan.mutation_policy) lines.push(`Mutation policy: ${plan.mutation_policy.rule}`);
  lines.push('');
  lines.push('## Rules');
  for (const rule of plan.rules) lines.push(`- ${rule}`);
  lines.push('');
  if (plan.research_council?.scouts?.length) {
    lines.push('## Genius Scout Council');
    lines.push(`Policy: ${plan.research_council.policy}`);
    for (const scout of plan.research_council.scouts) lines.push(`- ${researchScoutAgentName(scout)}: ${scout.persona || scout.role} - ${scout.mandate} (${scout.persona_boundary || 'persona-inspired lens only'})`);
    lines.push('');
  }
  if (plan.web_research_policy) {
    lines.push('## Web Research Policy');
    lines.push(`Mode: ${plan.web_research_policy.mode}`);
    lines.push(`Requirement: ${plan.web_research_policy.requirement}`);
    for (const querySet of plan.web_research_policy.query_sets || []) lines.push(`- query set: ${querySet}`);
    if (plan.web_research_policy.skill_creator?.artifact) lines.push(`- source skill artifact: ${plan.web_research_policy.skill_creator.artifact}`);
    for (const layer of plan.web_research_policy.source_layers || []) {
      lines.push(`- layer ${layer.id}: ${layer.purpose}`);
    }
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

export function researchSourceSkillMarkdown(plan) {
  const layers = plan?.web_research_policy?.source_layers?.length ? plan.web_research_policy.source_layers : RESEARCH_SOURCE_LAYERS;
  const lines = [];
  lines.push('# Research Source Layer Skill');
  lines.push('');
  lines.push('Status: route-local candidate skill. Use it inside this research mission before scout synthesis. Do not install or edit generated .agents/skills from this artifact.');
  lines.push('Real-run policy: collect live sources for as long as needed within the mission timeout; mock or fixture evidence is valid only for explicit --mock selftests.');
  lines.push('');
  lines.push('## Trigger');
  lines.push('- Any `$Research` run that must collect broad public evidence before creative synthesis, debate, falsification, or paper writing.');
  lines.push('');
  lines.push('## Source Layers');
  for (const layer of layers) {
    lines.push(`- ${layer.id}: ${layer.purpose}`);
    lines.push(`  Examples: ${(layer.examples || []).join(', ')}`);
    lines.push(`  Query templates: ${(layer.query_templates || []).join(' | ')}`);
  }
  lines.push('');
  lines.push('## Output Contract');
  lines.push('- Fill source-ledger.json with `source_layers`, `sources[].layer`, `counterevidence_sources[].layer`, `citation_coverage`, `triangulation.cross_layer_checks`, and `blockers`.');
  lines.push('- Each source entry should record title, locator/URL, publisher or author when known, published_at when known, accessed_at, layer, reliability, credibility, stance, supports or undermines, and notes.');
  lines.push('- Public discourse sources such as X/Twitter or Reddit are signals and edge cases, not truth. They must be triangulated with formal, official, practitioner, or counterevidence layers.');
  lines.push('- If a layer cannot be searched with the available runtime or credentials, record the blocker and keep research-gate.json unpassed.');
  lines.push('- Do not modify repository source code or generated harness files during Research; write only route-local mission artifacts.');
  lines.push('');
  lines.push('## Debate Use');
  lines.push('- Every scout must cite source-ledger ids in findings and Eureka ideas.');
  lines.push('- The skeptic lens must challenge the strongest claim using counterevidence or source-quality downgrades.');
  lines.push('- Continue scout/debate/falsification cycles until every scout agrees to the surviving mechanism. Record `unanimous_consensus=true`, `consensus_iterations`, and per-scout agreement in debate-ledger.json.');
  lines.push('- Synthesis keeps only claims that survive cross-layer triangulation and falsification.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function countResearchPaperSections(text = '') {
  const headings = String(text || '').toLowerCase().split(/\n/).filter((line) => /^#{1,3}\s+/.test(line));
  return RESEARCH_PAPER_SECTION_GROUPS.filter((group) => headings.some((heading) => group.some((term) => heading.includes(term)))).length;
}

export function countGeniusOpinionSummaries(text = '') {
  const lower = String(text || '').toLowerCase();
  return RESEARCH_SCOUT_COUNCIL.filter((scout) => {
    const label = String(scout.label || '').toLowerCase();
    const display = String(scout.display_name || '').toLowerCase();
    return lower.includes(String(scout.id || '').toLowerCase()) || (label && lower.includes(label)) || (display && lower.includes(display));
  }).length;
}

export async function writeResearchPlan(dir, prompt, opts = {}) {
  const plan = createResearchPlan(prompt, opts);
  await writeJsonAtomic(path.join(dir, 'research-plan.json'), plan);
  await writeTextAtomic(path.join(dir, 'research-plan.md'), researchPlanMarkdown(plan));
  await writeTextAtomic(path.join(dir, RESEARCH_SOURCE_SKILL_ARTIFACT), researchSourceSkillMarkdown(plan));
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
  const sourceLayers = plan?.web_research_policy?.source_layers?.length ? plan.web_research_policy.source_layers : RESEARCH_SOURCE_LAYERS;
  return {
    schema_version: 1,
    policy: plan?.web_research_policy?.mode || 'layered_source_retrieval_and_triangulation',
    created_at: nowIso(),
    source_layer_skill: {
      artifact: RESEARCH_SOURCE_SKILL_ARTIFACT,
      status: 'planned'
    },
    web_search_passes: 0,
    source_layers: sourceLayers.map((layer) => ({
      id: layer.id,
      label: layer.label,
      required: true,
      status: 'pending',
      evidence_role: layer.evidence_role,
      query_templates: layer.query_templates || [],
      source_ids: [],
      counterevidence_ids: [],
      blocker: null,
      notes: ''
    })),
    layer_coverage: {
      required: sourceLayers.map((layer) => layer.id),
      covered: [],
      missing: sourceLayers.map((layer) => layer.id),
      notes: []
    },
    queries: [],
    sources: [],
    counterevidence_sources: [],
    triangulation: {
      cross_layer_checks: [],
      conflicts: [],
      synthesis_notes: []
    },
    quality_model: {
      reporting_basis: 'Record enough source metadata to make search reproducible, including query, layer, locator, publisher or author, publication date when known, accessed_at, reliability, credibility, stance, and cited claim ids.',
      source_quality_fields: ['layer', 'kind', 'title', 'locator', 'publisher_or_author', 'published_at', 'accessed_at', 'reliability', 'credibility', 'stance', 'supports', 'undermines']
    },
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
      agent_name: researchScoutAgentName(scout),
      display_name: scout.display_name || scout.label || scout.id,
      historical_inspiration: scout.historical_inspiration || null,
      persona: scout.persona || scout.role,
      persona_boundary: scout.persona_boundary || 'persona-inspired cognitive lens only; do not impersonate the historical person',
      role: scout.role,
      mandate: scout.mandate,
      effort: 'xhigh',
      reasoning_effort: 'xhigh',
      service_tier: scout.service_tier || 'fast',
      eureka: {
        exclamation: 'Eureka!',
        idea: '',
        why_it_matters: '',
        source_ids: []
      },
      query_set: [],
      findings: [],
      falsifiers: [],
      cheap_probes: [],
      challenge_or_response: ''
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
    mode: 'vigorous_evidence_bound_debate_until_unanimous_consensus',
    required_participants: scouts.map((scout) => scout.id),
    participant_display_names: scouts.map((scout) => researchScoutAgentName(scout)),
    consensus_iterations: 0,
    unanimous_consensus: false,
    scout_agreements: scouts.map((scout) => ({
      scout_id: scout.id,
      agent_name: researchScoutAgentName(scout),
      display_name: scout.display_name || scout.label || scout.id,
      agrees: false,
      final_position: '',
      source_ids: []
    })),
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

function sourceLayerIdsForPlan(plan = null) {
  const layers = plan?.web_research_policy?.source_layers?.length ? plan.web_research_policy.source_layers : RESEARCH_SOURCE_LAYERS;
  return layers.map((layer) => layer.id).filter(Boolean);
}

function sourceLayerCoverageStats(sourceLedger = null, requiredLayerIds = RESEARCH_SOURCE_LAYER_IDS) {
  const covered = new Set();
  const sourceRows = [
    ...(Array.isArray(sourceLedger?.sources) ? sourceLedger.sources : []),
    ...(Array.isArray(sourceLedger?.counterevidence_sources) ? sourceLedger.counterevidence_sources : [])
  ];
  for (const source of sourceRows) {
    const layer = source?.layer || source?.layer_id || source?.source_layer;
    if (requiredLayerIds.includes(layer)) covered.add(layer);
  }
  for (const layer of Array.isArray(sourceLedger?.source_layers) ? sourceLedger.source_layers : []) {
    const id = layer?.id || layer?.layer;
    const sourceIds = [
      ...(Array.isArray(layer?.source_ids) ? layer.source_ids : []),
      ...(Array.isArray(layer?.counterevidence_ids) ? layer.counterevidence_ids : [])
    ];
    if (requiredLayerIds.includes(id) && layer?.status === 'covered' && sourceIds.length > 0) covered.add(id);
  }
  const missing = requiredLayerIds.filter((id) => !covered.has(id));
  return { covered: [...covered], missing, required: [...requiredLayerIds] };
}

function consensusStats(debateLedger = null, gate = {}) {
  const required = RESEARCH_SCOUT_COUNCIL.map((scout) => scout.id);
  const rows = [
    ...(Array.isArray(debateLedger?.scout_agreements) ? debateLedger.scout_agreements : []),
    ...(Array.isArray(debateLedger?.consensus?.scout_agreements) ? debateLedger.consensus.scout_agreements : []),
    ...(Array.isArray(debateLedger?.final_positions) ? debateLedger.final_positions : [])
  ];
  const agreed = new Set();
  for (const row of rows) {
    const id = row?.scout_id || row?.id || row?.scout;
    if (required.includes(id) && (row.agrees === true || row.agreement === true || row.final_agreement === true)) agreed.add(id);
  }
  const explicitUnanimous = debateLedger?.unanimous_consensus === true
    || debateLedger?.consensus?.unanimous_consensus === true
    || debateLedger?.consensus?.unanimous === true
    || gate.unanimous_consensus === true;
  const iterations = Math.max(
    Number(gate.consensus_iterations || 0),
    Number(debateLedger?.consensus_iterations || 0),
    Number(debateLedger?.consensus?.iterations || 0)
  );
  const unanimous = explicitUnanimous && required.every((id) => agreed.has(id));
  return {
    unanimous,
    iterations,
    agreed_count: agreed.size,
    required_count: required.length,
    missing: required.filter((id) => !agreed.has(id))
  };
}

export function defaultResearchGate() {
  return {
    passed: false,
    report_present: false,
    research_paper_artifact: null,
    paper_present: false,
    paper_sections: 0,
    genius_opinion_summary_present: false,
    genius_opinion_summaries: 0,
    research_source_skill_present: false,
    source_ledger_present: false,
    scout_ledger_present: false,
    debate_ledger_present: false,
    novelty_ledger_present: false,
    falsification_ledger_present: false,
    web_search_policy: 'layered_source_retrieval_and_triangulation',
    web_search_passes: 0,
    source_entries: 0,
    source_layers_required: RESEARCH_SOURCE_LAYER_IDS.length,
    source_layers_covered: 0,
    triangulation_checks: 0,
    independent_scouts: 0,
    xhigh_scouts: 0,
    eureka_moments: 0,
    scout_findings: 0,
    debate_participants: 0,
    debate_exchanges: 0,
    consensus_iterations: 0,
    unanimous_consensus: false,
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
  const plan = await readJson(path.join(dir, 'research-plan.json'), null);
  const reportPresent = await exists(path.join(dir, 'research-report.md'));
  const paperArtifact = await findResearchPaperArtifact(dir, plan);
  const paperPresent = paperArtifact.exists;
  const paperText = paperPresent ? await readText(paperArtifact.path, '') : '';
  const paperSections = paperPresent ? countResearchPaperSections(paperText) : 0;
  const geniusSummaryPresent = await exists(path.join(dir, RESEARCH_GENIUS_SUMMARY_ARTIFACT));
  const geniusSummaryCount = geniusSummaryPresent ? countGeniusOpinionSummaries(await readText(path.join(dir, RESEARCH_GENIUS_SUMMARY_ARTIFACT), '')) : 0;
  const sourceSkillPresent = await exists(path.join(dir, RESEARCH_SOURCE_SKILL_ARTIFACT));
  const sourcePresent = await exists(path.join(dir, 'source-ledger.json'));
  const scoutPresent = await exists(path.join(dir, 'scout-ledger.json'));
  const debatePresent = await exists(path.join(dir, 'debate-ledger.json'));
  const ledgerPresent = await exists(path.join(dir, 'novelty-ledger.json'));
  const falsificationPresent = await exists(path.join(dir, 'falsification-ledger.json'));
  const sourceLedger = await readJson(path.join(dir, 'source-ledger.json'), null);
  const scoutLedger = await readJson(path.join(dir, 'scout-ledger.json'), null);
  const debateLedger = await readJson(path.join(dir, 'debate-ledger.json'), null);
  const falsificationLedger = await readJson(path.join(dir, 'falsification-ledger.json'), null);
  const geniusSummaryText = geniusSummaryPresent ? await readText(path.join(dir, RESEARCH_GENIUS_SUMMARY_ARTIFACT), '') : '';
  const personaValidation = validateResearchScoutPersonas(scoutLedger || {}, geniusSummaryText);
  const sourceEntries = Array.isArray(sourceLedger?.sources) ? sourceLedger.sources.length : 0;
  const counterEvidenceEntries = Array.isArray(sourceLedger?.counterevidence_sources) ? sourceLedger.counterevidence_sources.length : 0;
  const webSearchPasses = Math.max(Number(gate.web_search_passes || 0), Number(sourceLedger?.web_search_passes || 0));
  const requiredSourceLayers = sourceLayerIdsForPlan(plan);
  const sourceLayerStats = sourceLayerCoverageStats(sourceLedger, requiredSourceLayers);
  const triangulationChecks = Array.isArray(sourceLedger?.triangulation?.cross_layer_checks) ? sourceLedger.triangulation.cross_layer_checks.length : 0;
  const scoutRows = Array.isArray(scoutLedger?.scouts) ? scoutLedger.scouts : [];
  const independentScouts = scoutRows.filter((scout) => Array.isArray(scout.findings) && scout.findings.length > 0).length;
  const xhighScouts = scoutRows.filter((scout) => scout.effort === 'xhigh').length;
  const eurekaMoments = scoutRows.filter((scout) => scout.eureka?.exclamation === 'Eureka!' && String(scout.eureka?.idea || '').trim()).length;
  const scoutFindings = scoutRows.reduce((sum, scout) => sum + (Array.isArray(scout.findings) ? scout.findings.length : 0), 0);
  const debateRows = Array.isArray(debateLedger?.exchanges) ? debateLedger.exchanges : [];
  const debateParticipants = new Set(debateRows.flatMap((exchange) => [exchange?.from, exchange?.to, ...(Array.isArray(exchange?.participants) ? exchange.participants : [])].filter(Boolean))).size;
  const debateExchanges = debateRows.length;
  const consensus = consensusStats(debateLedger, gate);
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
  if (!geniusSummaryPresent && gate.genius_opinion_summary_present !== true) reasons.push('genius_opinion_summary_missing');
  if (Math.max(Number(gate.genius_opinion_summaries || 0), geniusSummaryCount) < RESEARCH_SCOUT_COUNCIL.length) reasons.push('genius_opinion_summary_incomplete');
  if (!sourceSkillPresent && gate.research_source_skill_present !== true) reasons.push('research_source_skill_missing');
  if (!sourcePresent && gate.source_ledger_present !== true) reasons.push('source_ledger_missing');
  if (!scoutPresent && gate.scout_ledger_present !== true) reasons.push('scout_ledger_missing');
  if (!debatePresent && gate.debate_ledger_present !== true) reasons.push('debate_ledger_missing');
  if (!ledgerPresent && gate.novelty_ledger_present !== true) reasons.push('novelty_ledger_missing');
  if (!falsificationPresent && gate.falsification_ledger_present !== true) reasons.push('falsification_ledger_missing');
  if (webSearchPasses < 1) reasons.push('web_search_pass_missing');
  if (Math.max(Number(gate.source_entries || 0), sourceEntries) < 1) reasons.push('source_entry_missing');
  if (Math.max(Number(gate.source_layers_covered || 0), sourceLayerStats.covered.length) < requiredSourceLayers.length) reasons.push('source_layer_coverage_missing');
  if (Math.max(Number(gate.triangulation_checks || 0), triangulationChecks) < 1) reasons.push('cross_layer_triangulation_missing');
  if (Math.max(Number(gate.independent_scouts || 0), independentScouts) < RESEARCH_SCOUT_COUNCIL.length) reasons.push('independent_scouts_missing');
  if (Math.max(Number(gate.xhigh_scouts || 0), xhighScouts) < RESEARCH_SCOUT_COUNCIL.length) reasons.push('scout_effort_not_xhigh');
  if (Math.max(Number(gate.eureka_moments || 0), eurekaMoments) < RESEARCH_SCOUT_COUNCIL.length) reasons.push('eureka_missing');
  if (!personaValidation.ok) reasons.push(...personaValidation.issues.map((issue) => `scout_persona:${issue}`));
  if (Math.max(Number(gate.scout_findings || 0), scoutFindings) < 4) reasons.push('scout_findings_missing');
  if (Math.max(Number(gate.debate_participants || 0), debateParticipants) < RESEARCH_SCOUT_COUNCIL.length) reasons.push('debate_participants_missing');
  if (Math.max(Number(gate.debate_exchanges || 0), debateExchanges) < RESEARCH_SCOUT_COUNCIL.length) reasons.push('debate_exchanges_missing');
  if (Math.max(Number(gate.consensus_iterations || 0), consensus.iterations) < 1) reasons.push('consensus_iteration_missing');
  if (!consensus.unanimous) reasons.push('unanimous_consensus_missing');
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
      research_paper_artifact: paperArtifact.name,
      paper_present: paperPresent || gate.paper_present === true,
      web_search_passes: webSearchPasses,
      paper_sections: Math.max(Number(gate.paper_sections || 0), paperSections),
      genius_opinion_summary_present: geniusSummaryPresent || gate.genius_opinion_summary_present === true,
      genius_opinion_summaries: Math.max(Number(gate.genius_opinion_summaries || 0), geniusSummaryCount),
      research_source_skill_present: sourceSkillPresent || gate.research_source_skill_present === true,
      source_entries: Math.max(Number(gate.source_entries || 0), sourceEntries),
      source_layers_required: requiredSourceLayers.length,
      source_layers_covered: Math.max(Number(gate.source_layers_covered || 0), sourceLayerStats.covered.length),
      source_layers_missing: sourceLayerStats.missing,
      triangulation_checks: Math.max(Number(gate.triangulation_checks || 0), triangulationChecks),
      independent_scouts: Math.max(Number(gate.independent_scouts || 0), independentScouts),
      xhigh_scouts: Math.max(Number(gate.xhigh_scouts || 0), xhighScouts),
      eureka_moments: Math.max(Number(gate.eureka_moments || 0), eurekaMoments),
      scout_persona_contract_ok: personaValidation.ok,
      scout_persona_issues: personaValidation.issues,
      scout_findings: Math.max(Number(gate.scout_findings || 0), scoutFindings),
      debate_participants: Math.max(Number(gate.debate_participants || 0), debateParticipants),
      debate_exchanges: Math.max(Number(gate.debate_exchanges || 0), debateExchanges),
      consensus_iterations: Math.max(Number(gate.consensus_iterations || 0), consensus.iterations),
      unanimous_consensus: consensus.unanimous,
      consensus_agreed_scouts: consensus.agreed_count,
      consensus_missing_scouts: consensus.missing,
      counterevidence_sources: Math.max(Number(gate.counterevidence_sources || 0), counterEvidenceEntries),
      falsification_cases: Math.max(Number(gate.falsification_cases || 0), falsificationCases),
      citation_coverage: citationCoverage,
      web_search_blockers: searchBlockers.length
    },
    gate: {
      ...gate,
      research_paper_artifact: paperArtifact.name,
      paper_present: paperPresent || gate.paper_present === true
    }
  };
  await writeJsonAtomic(path.join(dir, 'research-gate.evaluated.json'), result);
  return result;
}

export async function writeMockResearchResult(dir, plan) {
  const paperArtifact = researchPaperArtifactForPlan(plan);
  const mockLayerSources = RESEARCH_SOURCE_LAYERS.map((layer, index) => ({
    id: `mock-source-${index + 1}`,
    layer: layer.id,
    kind: 'selftest',
    title: `Mock ${layer.label} coverage`,
    locator: 'writeMockResearchResult',
    accessed_at: nowIso(),
    reliability: 'mock',
    credibility: 'mock',
    stance: layer.id === 'counterevidence_factcheck' ? 'undermines' : 'supports',
    supports: layer.id === 'counterevidence_factcheck' ? [] : ['mock-insight-1'],
    undermines: layer.id === 'counterevidence_factcheck' ? ['mock-insight-1'] : [],
    notes: `Selftest fixture for the ${layer.id} source layer; no live web call is made in --mock mode.`
  }));
  const sourceLedger = {
    schema_version: 1,
    policy: 'layered_source_retrieval_and_triangulation',
    created_at: nowIso(),
    mode: 'selftest_mock',
    source_layer_skill: {
      artifact: RESEARCH_SOURCE_SKILL_ARTIFACT,
      status: 'created'
    },
    web_search_passes: 1,
    source_layers: RESEARCH_SOURCE_LAYERS.map((layer, index) => ({
      id: layer.id,
      label: layer.label,
      required: true,
      status: 'covered',
      evidence_role: layer.evidence_role,
      query_templates: layer.query_templates || [],
      source_ids: [`mock-source-${index + 1}`],
      counterevidence_ids: layer.id === 'counterevidence_factcheck' ? ['mock-counter-1'] : [],
      blocker: null,
      notes: 'Mock mode records layer coverage without live web access.'
    })),
    layer_coverage: {
      required: [...RESEARCH_SOURCE_LAYER_IDS],
      covered: [...RESEARCH_SOURCE_LAYER_IDS],
      missing: [],
      notes: ['mock fixture covers every research source layer']
    },
    queries: RESEARCH_SOURCE_LAYERS.map((layer) => ({
      scout_id: layer.id === 'counterevidence_factcheck' ? 'skeptic' : null,
      layer: layer.id,
      query: `mock ${layer.id} layered research source search for ${plan.prompt}`,
      status: 'mocked'
    })),
    sources: mockLayerSources,
    counterevidence_sources: [
      {
        id: 'mock-counter-1',
        layer: 'counterevidence_factcheck',
        kind: 'selftest',
        title: 'Mock overclaim counterexample',
        locator: 'writeMockResearchResult',
        accessed_at: nowIso(),
        reliability: 'mock',
        credibility: 'mock',
        stance: 'undermines',
        undermines: ['mock-insight-1'],
        notes: 'Shows the gate must fail if a run produces no tests or falsifiers.'
      }
    ],
    triangulation: {
      cross_layer_checks: [
        {
          id: 'mock-triangulation-1',
          claim: 'Research Mode should not synthesize from a single corpus.',
          source_ids: ['mock-source-1', 'mock-source-2', 'mock-source-5', 'mock-counter-1'],
          result: 'survives_with_layered_evidence_requirement'
        },
        {
          id: 'mock-triangulation-2',
          claim: 'Public discourse is useful only when checked against formal and official layers.',
          source_ids: ['mock-source-1', 'mock-source-2', 'mock-source-5', 'mock-source-6'],
          result: 'downgrade_popularity_to_signal_not_truth'
        }
      ],
      conflicts: [],
      synthesis_notes: ['mock fixture requires cross-layer checks before synthesis']
    },
    quality_model: defaultSourceLedger(plan).quality_model,
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
      agent_name: researchScoutAgentName(scout),
      display_name: scout.display_name || scout.label,
      historical_inspiration: scout.historical_inspiration || null,
      persona: scout.persona || scout.role,
      persona_boundary: scout.persona_boundary,
      role: scout.role,
      mandate: scout.mandate,
      effort: 'xhigh',
      reasoning_effort: 'xhigh',
      service_tier: scout.service_tier || 'fast',
      eureka: {
        exclamation: 'Eureka!',
        idea: `${scout.display_name || scout.label} spots a non-obvious, testable angle for ${plan.prompt}.`,
        why_it_matters: 'It forces the run to produce one falsifiable idea before synthesis.',
        source_ids: ['mock-source-1']
      },
      query_set: sourceLedger.queries.filter((query) => query.scout_id === scout.id).map((query) => query.query),
      findings: [
        {
          id: `mock-${scout.id}-finding-1`,
          claim: `${scout.display_name || scout.label} supports a source-cited, falsifiable research gate for ${plan.prompt}.`,
          source_ids: ['mock-source-1'],
          status: 'mock_supported'
        }
      ],
      falsifiers: ['A run without cited sources, counterevidence, or cheap probes should fail the research gate.'],
      cheap_probes: ['Compare discovery-loop output against a summary-only baseline and count testable insights.'],
      challenge_or_response: 'Participated in the mock evidence-bound debate.'
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
    mode: 'vigorous_evidence_bound_debate_until_unanimous_consensus',
    required_participants: RESEARCH_SCOUT_COUNCIL.map((scout) => scout.id),
    participant_display_names: RESEARCH_SCOUT_COUNCIL.map((scout) => researchScoutAgentName(scout)),
    consensus_iterations: 2,
    unanimous_consensus: true,
    scout_agreements: RESEARCH_SCOUT_COUNCIL.map((scout) => ({
      scout_id: scout.id,
      agent_name: researchScoutAgentName(scout),
      display_name: scout.display_name || scout.label,
      agrees: true,
      final_position: 'Agrees to keep the falsifiable, source-cited research mechanism as the surviving claim.',
      source_ids: ['mock-source-1', 'mock-counter-1']
    })),
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
  const geniusSummary = [
    '# Genius Opinion Summary',
    '',
    `Prompt: ${plan.prompt}`,
    '',
    '## Scout Opinions',
    ...RESEARCH_SCOUT_COUNCIL.flatMap((scout) => [
      `### ${scout.display_name || scout.label} (${scout.id})`,
      `Final opinion: ${scout.display_name || scout.label} wants the run to preserve ${scout.mandate.toLowerCase()} while producing a cited, falsifiable insight.`,
      'Strongest evidence: mock-source-1 plus the layered source ledger.',
      'Main disagreement: whether formal structure or cheap empirical probes should dominate the first pass.',
      'Changed mind: accepted that citation coverage, counterevidence, and triangulation are gates before synthesis.',
      ''
    ]),
    '## Council Consensus',
    'The council keeps one modest, testable claim: Research Mode is useful when it writes a source-cited paper, records every scout opinion, triangulates across source layers, and exposes the next decisive test.'
  ].join('\n');
  await writeTextAtomic(path.join(dir, RESEARCH_SOURCE_SKILL_ARTIFACT), researchSourceSkillMarkdown(plan));
  await writeJsonAtomic(path.join(dir, 'source-ledger.json'), sourceLedger);
  await writeJsonAtomic(path.join(dir, 'scout-ledger.json'), scoutLedger);
  await writeJsonAtomic(path.join(dir, 'debate-ledger.json'), debateLedger);
  await writeJsonAtomic(path.join(dir, 'falsification-ledger.json'), falsificationLedger);
  await writeJsonAtomic(path.join(dir, 'novelty-ledger.json'), ledger);
  await writeTextAtomic(path.join(dir, RESEARCH_GENIUS_SUMMARY_ARTIFACT), `${geniusSummary}\n`);
  await writeTextAtomic(path.join(dir, 'research-report.md'), `# SKS Research Report\n\nPrompt: ${plan.prompt}\n\n## Scout Council Synthesis\n\nThe mock council keeps one cited methodological insight: a research mode should force layered, falsifiable novelty rather than summarize known material from one corpus [mock-source-1].\n\n## Source Coverage\n\nThis is a selftest fixture. It records mock coverage for academic literature, official data, standards, news, public discourse, developer knowledge, and counterevidence layers, but does not perform live web browsing in --mock mode.\n\n## Candidate Insight\n\nA useful research run must produce source-cited, cross-layer triangulated, falsifiable novelty with scout findings and a cheap probe.\n\n## Falsification\n\nThe claim is weak if no new testable prediction, counterevidence source, cross-layer check, or experiment is produced [mock-counter-1].\n\n## Next Test\n\nCompare this mode against a summary-only run and score candidate insights, falsification passes, citation coverage, source-layer coverage, triangulation checks, and testability.\n`);
  await writeTextAtomic(path.join(dir, paperArtifact), `# Research Paper: ${plan.prompt}\n\n## Abstract\nA source-cited research run should produce cross-layer, falsifiable novelty rather than only summarize known material.\n\n## Introduction\nThe mock topic is evaluated as a research workflow outcome with layered source coverage [mock-source-1].\n\n## Methodology\nFive xhigh scouts produce Eureka ideas, debate, triangulate source layers, and falsify the strongest claim.\n\n## Findings\nThe surviving finding is that useful research needs cited novelty, source-layer coverage, cross-layer triangulation, and a cheap decisive probe.\n\n## Discussion\nThe debate favors gate-backed evidence over narrative confidence, and treats public discourse as signal rather than truth.\n\n## Limitations and Falsification\nThe claim fails without sources, counterevidence, triangulation checks, or testable predictions [mock-counter-1].\n\n## Conclusion and Next Experiment\nCompare this loop against a summary-only baseline and score testable insights.\n\n## References\n- [mock-source-1] Mock academic literature coverage.\n- [mock-source-2] Mock official government and leading-institution knowledge coverage.\n- [mock-source-3] Mock standards and primary documents coverage.\n- [mock-source-4] Mock current news and global reporting coverage.\n- [mock-source-5] Mock public discourse coverage.\n- [mock-source-6] Mock developer and practitioner knowledge coverage.\n- [mock-source-7] Mock counterevidence and fact-checking coverage.\n- [mock-counter-1] Mock overclaim counterexample.\n`);
  await writeJsonAtomic(path.join(dir, 'research-gate.json'), {
    ...defaultResearchGate(),
    passed: true,
    report_present: true,
    research_paper_artifact: paperArtifact,
    paper_present: true,
    paper_sections: RESEARCH_PAPER_SECTION_GROUPS.length,
    genius_opinion_summary_present: true,
    genius_opinion_summaries: RESEARCH_SCOUT_COUNCIL.length,
    research_source_skill_present: true,
    source_ledger_present: true,
    scout_ledger_present: true,
    debate_ledger_present: true,
    novelty_ledger_present: true,
    falsification_ledger_present: true,
    web_search_passes: 1,
    source_entries: mockLayerSources.length,
    source_layers_required: RESEARCH_SOURCE_LAYER_IDS.length,
    source_layers_covered: RESEARCH_SOURCE_LAYER_IDS.length,
    triangulation_checks: sourceLedger.triangulation.cross_layer_checks.length,
	    independent_scouts: RESEARCH_SCOUT_COUNCIL.length,
	    xhigh_scouts: RESEARCH_SCOUT_COUNCIL.length,
	    eureka_moments: RESEARCH_SCOUT_COUNCIL.length,
	    scout_findings: RESEARCH_SCOUT_COUNCIL.length,
	    debate_participants: RESEARCH_SCOUT_COUNCIL.length,
	    debate_exchanges: debateLedger.exchanges.length,
	    consensus_iterations: debateLedger.consensus_iterations,
	    unanimous_consensus: true,
	    counterevidence_sources: 1,
    candidate_insights: 1,
    falsification_passes: 1,
    falsification_cases: 1,
    testable_predictions: 1,
    citation_coverage: true,
    evidence: ['mock research report', `mock research paper: ${paperArtifact}`, 'mock genius opinion summary', 'mock research source skill', 'mock layered source ledger', 'mock scout ledger', 'mock debate ledger', 'mock novelty ledger', 'mock falsification ledger'],
    notes: ['mock mode records the new contract but does not call a model or perform live web browsing']
  });
  return evaluateResearchGate(dir);
}

export function buildResearchPrompt({ id, mission, plan, cycle, previous }) {
  const paperArtifact = researchPaperArtifactForPlan(plan);
  const scoutAgentNames = (plan?.research_council?.scouts || RESEARCH_SCOUT_COUNCIL).map((scout) => researchScoutAgentName(scout)).join(', ');
  return `You are running SKS Research Mode.\nMISSION: ${id}\nTOPIC: ${mission.prompt}\nCYCLE: ${cycle}\nMODE: Genius Scout Council + frontier discovery loop. Use maximum reasoning depth available under the current Codex profile.\nLONG-RUN REAL-RESEARCH POLICY: Normal Research is allowed to take one or two hours when the question requires it. Do real source gathering and evidence comparison; do not shortcut into mock, fixture, or summary-only output. If live source access is unavailable, write the blocker and keep the gate unpassed.\nNO-CODE-MUTATION POLICY: Do not edit repository source, package metadata, docs, config, generated skills, or harness files. Write only route-local artifacts under .sneakoscope/missions/${id}/. If a needed implementation change is discovered, record it as a recommendation or blocker for a later execution route.\nNO-QUESTION LOCK: Do not ask the user. Resolve scope from research-plan.json and current project evidence.\nSAFETY: Destructive database operations and unsafe external actions are forbidden. Prefer read-only inspection, local files, and cited public sources.\nPERSONA POLICY: Use Einstein/Feynman/Turing/von Neumann-inspired scout lenses only as cognitive roles. Do not impersonate, roleplay private identity, or speak as the historical people.\nSCOUT PERSONA POLICY: Every Research scout row must include agent_name, display_name, persona, persona_boundary, reasoning_effort: "xhigh", service_tier when available, falsifiers, cheap_probes, and challenge_or_response. Use these agent_name values exactly: ${scoutAgentNames}. Persona names are cognitive lenses, not impersonations.\nSCOUT EFFORT POLICY: Every Research scout agent must use reasoning_effort=xhigh. Record effort: "xhigh" for every scout in scout-ledger.json. Any lower-effort scout output must keep research-gate.json unpassed.\nEUREKA POLICY: Every scout must literally write "Eureka!" and one non-obvious, source-linked idea before debate.\nCONSENSUS LOOP POLICY: This is not a fixed three-cycle run. Repeat source-gathering, scout Eureka ideas, debate, falsification, and synthesis pressure until every scout records final agreement with the surviving mechanism. If unanimous agreement is not reached, keep research-gate.json unpassed and continue until the explicit max-cycle safety cap pauses the run.\nDEBATE POLICY: The scouts must debate vigorously but stay evidence-bound. Every scout must challenge or respond at least once, and debate-ledger.json must record exchanges, consensus_iterations, unanimous_consensus, and per-scout agreements before synthesis.\nPAPER POLICY: After the report and ledgers, write ${paperArtifact} as a concise manuscript with Abstract, Introduction, Methodology, Findings/Results, Discussion, Limitations/Falsification, Conclusion/Next Experiment, and References.\nSOURCE SKILL POLICY: Create or update ${RESEARCH_SOURCE_SKILL_ARTIFACT} as a route-local source collection skill before synthesis. It must name the selected source layers, query routes, quality fields, blockers, and cross-layer triangulation checks. Do not edit generated .agents/skills during the research run.\nWEB/SOURCE POLICY: Run layered source retrieval across every safely available layer before synthesis: latest public papers, official government or leading-institution data, standards or primary docs, current news including BBC/CNN/GDELT-style sources when relevant, public discourse including X/Twitter and Reddit when available, developer/practitioner sources such as Stack Overflow/Stack Exchange/GitHub, and counterevidence or fact-checking sources. Treat public discourse as signal, not truth. If a layer cannot be searched, record the blocker in source-ledger.json and do not pass the gate.\nRESEARCH PLAN:\n${JSON.stringify(plan, null, 2)}\n\nOBJECTIVE: Produce genuinely useful candidate discoveries: non-obvious hypotheses, mechanisms, predictions, or experiments. Do not merely summarize. Mark uncertainty clearly.\n\nREQUIRED PROCESS:\n1. Source skill first: create ${RESEARCH_SOURCE_SKILL_ARTIFACT} with source layers, query templates, quality fields, blockers, and triangulation rules.\n2. Layered source search: create source-ledger.json with source_layers, queries, source ids, source quality notes, counterevidence sources, triangulation.cross_layer_checks, citation coverage, and blockers.\n3. Independent xhigh scouts: create scout-ledger.json with agent_name/display_name/persona/persona_boundary, effort=xhigh, reasoning_effort=xhigh, a literal Eureka! idea, findings, source_ids, falsifiers, cheap_probes, and challenge_or_response for every scout lens.\n4. Debate to agreement: create debate-ledger.json with evidence-bound challenge/response exchanges involving every scout, consensus_iterations >= 1, unanimous_consensus=true only when all scouts agree, and scout_agreements for every scout.\n5. Falsification: create falsification-ledger.json with attacks, missing evidence, source conflicts, and decisive next tests.\n6. Synthesis: write research-report.md and novelty-ledger.json only after cited scout findings, Eureka ideas, unanimous debate agreement, cross-layer triangulation, and falsification are recorded.\n7. Paper: write ${paperArtifact} as a paper-style manuscript with source-ledger references and limitations.\n\nREQUIRED OUTPUT FILES in .sneakoscope/missions/${id}/:\n- research-report.md: concise report with framing, source coverage, scout synthesis, debate synthesis, hypotheses, falsification, predictions, and next experiments. Cite source-ledger ids for factual claims.\n- ${paperArtifact}: paper manuscript with Abstract, Introduction, Methodology, Findings/Results, Discussion, Limitations/Falsification, Conclusion/Next Experiment, and References using source-ledger ids.\n- ${RESEARCH_SOURCE_SKILL_ARTIFACT}: route-local source collection skill; it is evidence for the Skill Creator step and must not mutate generated .agents/skills.\n- source-ledger.json: layered web/source queries, source ids, source priority, source quality notes, counterevidence sources, citation coverage, triangulation checks, and blockers.\n- scout-ledger.json: one entry per scout lens with agent_name, display_name, persona, persona_boundary, effort, reasoning_effort, service_tier, eureka, query_set, findings, source_ids, falsifiers, cheap_probes, and challenge_or_response.\n- debate-ledger.json: evidence-bound challenge/response exchanges, participants, changed minds, unresolved conflicts, consensus_iterations, unanimous_consensus, and scout_agreements for every scout.\n- novelty-ledger.json: entries with claim, novelty, confidence, falsifiability, evidence source ids, falsifiers, next_experiment.\n- falsification-ledger.json: attacks/counterexamples/source conflicts, result, and next_decisive_tests.\n- research-gate.json: set passed only when all ledgers exist, ${RESEARCH_SOURCE_SKILL_ARTIFACT} exists, ${paperArtifact} exists with required paper sections, layered web/source retrieval covered every required source layer, at least one cross-layer triangulation check exists, all scouts have agent_name/display_name/persona/persona_boundary, all scouts have effort=xhigh, all scouts have literal Eureka! ideas, every scout participated in debate, consensus_iterations >= 1, unanimous_consensus=true with every scout agreement recorded, at least one counterevidence source exists, citation coverage is complete, at least one insight survived falsification, at least one testable prediction exists, and unsupported breakthrough claims are zero.\n\nPrevious cycle tail:\n${String(previous || '').slice(-2500)}\n`;
}
