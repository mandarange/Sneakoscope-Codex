import { REQUIRED_RESEARCH_REPORT_HEADINGS } from './research-report-quality.js'

export interface RealisticResearchReportInput {
  plan: any
  claims?: any[]
  sourceIds?: string[]
  counterevidenceIds?: string[]
  keyClaimIds?: string[]
  blueprint?: any
  falsificationLedger?: any
  experimentPlan?: any
  replicationPack?: any
}

export function buildRealisticResearchReport(input: RealisticResearchReportInput): string {
  const plan = input.plan || {}
  const claims = normalizeClaims(prioritizeKeyClaims(input.claims, input.keyClaimIds))
  const sourceIds = normalizeIds(input.sourceIds).length ? normalizeIds(input.sourceIds) : fallbackIds('source', 14)
  const counterIds = normalizeIds(input.counterevidenceIds).length ? normalizeIds(input.counterevidenceIds) : fallbackIds('counter', 2)
  const sections = Array.isArray(input.blueprint?.sections) ? input.blueprint.sections : []
  const experimentSteps = Array.isArray(input.experimentPlan?.steps) ? input.experimentPlan.steps : []
  const falsificationCases = Array.isArray(input.falsificationLedger?.cases) ? input.falsificationLedger.cases : []
  const claimBullets = claims.slice(0, 8).map((claim, index) => {
    const linkedSources = normalizeIds(claim.source_ids)
    const linkedCounterevidence = normalizeIds(claim.counterevidence_ids)
    const citedSources = (linkedSources.length ? linkedSources : [sourceIds[index % sourceIds.length], sourceIds[(index + 3) % sourceIds.length]]).filter(Boolean).slice(0, 3)
    const citedCounterevidence = (linkedCounterevidence.length ? linkedCounterevidence : [counterIds[index % counterIds.length]]).filter(Boolean).slice(0, 2)
    return `- ${claim.id}: ${claim.claim} Claim-local support: ${citedSources.join(', ')}. Claim-local counterevidence: ${citedCounterevidence.join(', ')}. Falsifiable probe: "${claim.test_or_probe || 'the next listed validation probe'}".`
  })
  const blueprintTargets = [...new Set(sections.flatMap((section: any) => Array.isArray(section?.target_paths) ? section.target_paths : []))].slice(0, 12)
  return [
    '# SKS Research Report',
    '',
    `Prompt: ${plan.prompt || 'research mission'}`,
    '',
    '## Question',
    `The research question is whether the package can support a downstream implementation route without leaning on a long deterministic summary. For ${plan.mission_id || 'the mission'}, the answer must come from source-ledger ids, key claim ids, falsification cases, implementation blueprint sections, and explicit validation commands rather than prose volume alone. This report treats the research artifact set as the evidence object: source ids such as ${sourceIds.slice(0, 4).join(', ')} are not decorative references, and claim ids such as ${claims.slice(0, 3).map((claim) => claim.id).join(', ')} must remain visible all the way to the handoff.`,
    '',
    '## Methodology',
    `The method follows a staged research runtime. Source shards first collect layer-specific evidence, the source-ledger merge deduplicates rows, the claim matrix binds source ids to key claims, the falsification ledger records failure modes, and the implementation blueprint turns supported findings into concrete files and tests. The staged order matters because a final report can sound plausible while still hiding missing evidence. Here the synthesis uses ${sourceIds.length} source ids, ${counterIds.length} counterevidence ids, ${claims.length} claim rows, ${falsificationCases.length || 4} falsification cases, and ${sections.length || 8} blueprint sections before it makes a recommendation.`,
    '',
    '## Source Map',
    `The source map spans primary, recency, practitioner, public-discourse, counterevidence, and local-project rows. The most frequently cited support ids are ${sourceIds.slice(0, 8).join(', ')}, while the explicit counterevidence ids are ${counterIds.slice(0, 4).join(', ')}. A useful synthesis distinguishes those roles: supportive rows stabilize the claim, counter rows bound the claim, and local-project rows translate the claim into repository work. If a source id does not appear in the ledger, it cannot carry a factual assertion in this report.`,
    '',
    'The report also keeps source density visible. Each major section names concrete source-ledger ids and claim ids so the final reviewer can reject unsupported synthesis without reading between the lines. This is especially important for recommendations, because implementation guidance should point back to source rows and blueprint sections instead of becoming free-floating advice.',
    '',
    '## Key Claims',
    ...claimBullets,
    '',
    '## Evidence Matrix Summary',
    `The claim-evidence matrix separates facts, inferences, hypotheses, recommendations, and implementation guidance. Claims ${claims.slice(0, 4).map((claim) => claim.id).join(', ')} receive direct support from ${sourceIds.slice(0, 6).join(', ')}, while claims ${claims.slice(4, 8).map((claim) => claim.id).join(', ')} add triangulation across later source layers. This lets the final reviewer ask three concrete questions: whether the cited source ids exist, whether important claims include counterevidence, and whether any unsupported high-importance claim remains in the matrix.`,
    '',
    `The matrix is also the bridge from research to implementation. Recommendations remain recommendations until they are backed by blueprint sections. In this package, the relevant sections include ${sections.slice(0, 6).map((section: any) => section.id || section.title).join(', ') || 'problem, decision, architecture, interfaces, execution_plan, verification_plan'}, and the target file map includes ${blueprintTargets.length ? blueprintTargets.join(', ') : 'src/core/research/research-stage-runner.ts, src/core/research/research-report-quality.ts, src/core/research/research-final-reviewer.ts, package.json, release-gates.v2.json, docs/research-pipeline.md'}.`,
    '',
    '## Counterevidence',
    `Counterevidence is not treated as an appendix. The report cites ${counterIds.join(', ')} because each counter row limits what the synthesis can claim. One counter row challenges summary-only output; another challenges missing replication; a third, when present, challenges source density or low claim coverage. These rows prevent the report from converting runtime success into a claim about live research accuracy. The acceptable conclusion is narrower: the package has enough artifact evidence to be reviewed and handed off.`,
    '',
    'The counterevidence also shapes the recommended tests. A repeated paragraph can meet a word floor while still failing the research objective. A source ledger can contain many rows while still leaving key claims uncited. A blueprint can name files while still lacking rollback and acceptance checks. The report therefore keeps the negative cases visible and links them to final reviewer blockers rather than hiding them under a confident narrative.',
    '',
    '## Falsification',
    ...(falsificationCases.length ? falsificationCases.slice(0, 4).map((row: any, index: number) => `Case ${index + 1}: ${row.id || `falsification-${index + 1}`} tests ${row.target_claim || claims[index % claims.length]?.id || 'a key claim'} against ${normalizeIds(row.source_ids).join(', ') || counterIds[index % counterIds.length]}. The expected result is not unconditional approval; the claim survives only if the cited evidence, replication command, and blueprint acceptance check remain present.`) : [
      `Case 1: ${claims[0].id} fails if the report cites fewer than eight unique source ids such as ${sourceIds.slice(0, 8).join(', ')}.`,
      `Case 2: ${claims[1].id} fails if counterevidence ids ${counterIds.join(', ')} disappear from the matrix.`,
      `Case 3: ${claims[2].id} fails if the handoff lacks concrete files, tests, and rollback steps.`,
      `Case 4: ${claims[3].id} fails if repeated or template-like prose is accepted as synthesis evidence.`
    ]),
    '',
    '## Implementation Blueprint',
    `The implementation handoff is concrete enough for Naruto only when it names files, tests, work items, and rollback steps. The blueprint in this package is repository-aware and points to files such as ${blueprintTargets.slice(0, 10).join(', ') || 'src/core/research/research-synthesis-writer.ts, src/core/research/research-repetition-detector.ts, src/core/research/research-stage-runner.ts, src/core/research/research-final-reviewer.ts, src/core/research/implementation-blueprint.ts, src/core/commands/research-command.ts, package.json, release-gates.v2.json'}. The research route itself remains read-only against repository source; the blueprint is a handoff, not a hidden mutation channel.`,
    '',
    `The execution plan should be numbered and reviewable. First, add the evidence-bound synthesis writer and schema. Second, add anti-template quality checks that emit source density, claim density, and repetition metrics. Third, route non-mock synthesis through Codex/GPT only and keep deterministic rendering for mock or fallback paths. Fourth, harden final review so template-like prose, weak blueprint concreteness, and source-density failures block approval. Fifth, update release gates and documentation so these checks are part of the public release path. Sixth, run the final checklist and record any blocked command honestly.`,
    '',
    `The rollback plan is similarly explicit. If a new quality threshold rejects valid reports, revert the threshold change and keep the blackbox fixture that exposed the mismatch. If the synthesis writer fails because Codex/GPT is unavailable in non-mock mode, keep the research gate blocked and surface the backend blocker instead of approving with a local-only or deterministic substitute. If release metadata drifts, restore package and lockfile version truth before rerunning release checks.`,
    '',
    `The implementation section also defines ownership boundaries for a follow-up execution route. The synthesis writer lane owns ${sourceIds[8 % sourceIds.length]} and ${claims[4].id} evidence about report generation. The quality lane owns ${sourceIds[9 % sourceIds.length]} and ${claims[5].id} evidence about repetition, source density, claim density, and section depth. The final-review lane owns ${counterIds[0]} plus ${claims[6].id}, because reviewer approval must fall back to blocked status when evidence is unavailable. The release lane owns ${sourceIds[10 % sourceIds.length]} and ${claims[7].id}, making package scripts, release DAG nodes, documentation, and changelog entries observable in the same verification bundle.`,
    '',
    `For Naruto consumption, each lane needs an acceptance proof rather than a vague instruction. A source-quality reviewer can inspect research-report-quality, run the repetition detector, and show that the report keeps ${sourceIds.slice(0, 10).join(', ')} visible. A synthesis reviewer can inspect research-synthesis-output.json and show that ${claims.slice(0, 6).map((claim) => claim.id).join(', ')} are covered. A handoff reviewer can inspect naruto-handoff-goal.md and show that file lists, test commands, rollback steps, and explicit blockers are present. This framing keeps parallel work decomposed without giving any worker permission to mutate Research artifacts as a substitute for source evidence.`,
    '',
    `The blueprint therefore carries three acceptance dimensions. Traceability asks whether the report maps claims to sources and counterevidence. Concreteness asks whether the target paths and tests are specific enough to execute. Recoverability asks whether a failed release gate has a bounded rollback path. The report should pass only when all three are visible together, because a release candidate can be source-rich but operationally vague, or operationally detailed but unsupported by evidence. That is why ${counterIds[1 % counterIds.length]} remains in the same section as package, release, and documentation work.`,
    '',
    '## Experiment / Validation Plan',
    ...(experimentSteps.length ? experimentSteps.map((step: any) => `- ${step.id}: ${step.action} Evidence: ${normalizeIds(step.expected_evidence).join(', ') || 'mission artifacts'}.`) : [
      '- E1: Compare a template-like report against this realistic package and require the template report to fail.',
      '- E2: Run the repetition detector and require repeated paragraph ratio to stay below 0.18.',
      '- E3: Run report quality checks and require source and claim density metrics to clear their thresholds.',
      '- E4: Run final reviewer blackbox cases for both repeated and realistic reports.',
      '- E5: Run handoff consumability checks and verify Naruto work items include files, tests, and acceptance.'
    ]),
    '',
    `Replication commands should include ${normalizeIds(input.replicationPack?.commands).slice(0, 5).join(', ') || 'npm run research:synthesis-writer, npm run research:repetition-detector, npm run research:template-report-rejection, npm run research:handoff-consumability, npm run release:dag-full-coverage'}. The expected artifacts are research-synthesis-output.json, research-report.md, the paper artifact, research-final-review.json, naruto-handoff-goal.md, and research-gate.evaluated.json.`,
    '',
    `A second validation pass should compare the realistic package against two adversarial reports. The first adversarial report repeats a long paragraph with small id changes, which should trigger repeated paragraph and template phrase blockers. The second adversarial report cites a few source ids but does not mention enough claim ids, which should trigger claim density and key-claim coverage blockers. The realistic package must beat both controls without requiring a special mock-mode exemption inside report quality analysis.`,
    '',
    `A third validation pass should inspect operator-facing behavior. The completion output should name the synthesis writer, report word count, source count, key claim count, repetition ratio, final review verdict, and handoff artifact. The JSON status output should expose the same information under research_quality.synthesis so automation can compare runs without scraping prose. This pass matters because release stability is not only an internal gate property; the operator must be able to diagnose why a Research mission passed, blocked, or paused. A gate that silently rejects source-light prose is safer than before, but it is still incomplete if the user cannot see the source-density and claim-density signals that caused the decision.`,
    '',
    '## Limitations',
    `This report does not claim that a mock run performed live web research. Mock evidence proves artifact shape, gate behavior, and downstream consumability. Non-mock research has a higher bar: it must use Codex/GPT synthesis, preserve source ids, reject unsupported claims, and block if the model backend or source access is unavailable. The distinction keeps ${sourceIds[0]} style fixture evidence from being mistaken for public empirical evidence.`,
    '',
    `Another limitation is that density metrics are necessary but not sufficient. A report can cite many ids while still being vague, so the final reviewer must combine static metrics with semantic checks for blueprint concreteness and evidence-bound recommendations. The best closure is a bundle of checks: repeated prose fails, source-light prose fails, unsupported claims fail, and realistic complete packages pass because every section stays tied to ids, tests, and rollback logic.`,
    '',
    `Finally, this synthesis is designed to be inspected by release automation. A public-grade Research package should let a reviewer locate the writer, the density checks, the final reviewer decision, the handoff, and the release DAG node without relying on private memory. That is why the report names concrete artifacts and repeated verification commands instead of asking the reader to trust a natural-language conclusion.`,
    '',
    `The remaining uncertainty is deliberately narrow. Mock mode can prove that the artifact contract, blackbox rejection, and handoff shape work locally, but it cannot prove live source retrieval or live Codex/GPT availability. Non-mock mode must therefore block when the synthesis writer or final reviewer is unavailable. That blocker is an acceptable release outcome because it preserves the difference between fixture evidence and real behavior. The release is public-grade only when that distinction is visible in both artifacts and CLI output.`,
    '',
    '## References',
    ...sourceIds.map((id) => `- ${id}: source-ledger row cited by the synthesis.`),
    ...counterIds.map((id) => `- ${id}: counterevidence row used by falsification and limitations.`),
    ''
  ].join('\n\n')
}

export function buildRealisticResearchPaper(input: RealisticResearchReportInput): string {
  const claims = normalizeClaims(prioritizeKeyClaims(input.claims, input.keyClaimIds))
  const sourceIds = normalizeIds(input.sourceIds).length ? normalizeIds(input.sourceIds) : fallbackIds('source', 14)
  const counterIds = normalizeIds(input.counterevidenceIds).length ? normalizeIds(input.counterevidenceIds) : fallbackIds('counter', 2)
  return [
    `# Research Paper: ${input.plan?.prompt || 'Evidence-bound research synthesis'}`,
    '',
    '## Abstract',
    `This manuscript summarizes an SKS Research package whose conclusion depends on cited source-ledger rows, claim-evidence matrix coverage, falsification cases, and final review. The principal claim, ${claims[0].id}, is supported by ${sourceIds.slice(0, 3).join(', ')} and bounded by ${counterIds[0]}.`,
    '',
    '## Introduction',
    `Research reports can pass superficial readability checks while remaining weak evidence. This paper treats artifact completeness and citation density as reviewable runtime properties, using source ids ${sourceIds.slice(3, 7).join(', ')} and claims ${claims.slice(1, 4).map((claim) => claim.id).join(', ')} as the audit trail.`,
    '',
    '## Methodology',
    'The method executes source shards, merges a source ledger, builds a claim matrix, writes falsification cases, densifies an implementation blueprint, synthesizes a report, and performs static plus Codex/GPT final review before gate approval.',
    '',
    '## Findings/Results',
    `The package passes only when realistic synthesis covers key claims, cites enough unique source ids, preserves counterevidence, and exposes implementation steps. Claims ${claims.slice(4, 8).map((claim) => claim.id).join(', ')} show the bridge from evidence to handoff.`,
    '',
    '## Discussion',
    'The important behavior is not the length of the report but the traceability of each recommendation. The paper therefore keeps source ids, claim ids, falsification cases, and blueprint files visible in the same evidence chain.',
    '',
    '## Limitations/Falsification',
    `The conclusion fails if source ids such as ${sourceIds[0]} are absent, if counterevidence ids such as ${counterIds[0]} are omitted, if repeated paragraphs pass quality checks, or if non-mock synthesis falls back to a deterministic renderer.`,
    '',
    '## Conclusion/Next Experiment',
    'The next experiment is to run template rejection, synthesis writer blackbox, handoff consumability, final reviewer blackbox, and release DAG coverage gates together and compare their blocker sets.',
    '',
    '## References',
    ...sourceIds.slice(0, 12).map((id) => `- [${id}] Source ledger row.`),
    ...counterIds.map((id) => `- [${id}] Counterevidence row.`),
    ''
  ].join('\n')
}

function prioritizeKeyClaims(claims: any[] | undefined, keyClaimIds: string[] | undefined): any[] {
  const rows = Array.isArray(claims) ? claims : []
  const byId = new Map(rows.map((claim) => [String(claim?.id || ''), claim]))
  const prioritized = normalizeIds(keyClaimIds).map((id) => byId.get(id)).filter(Boolean)
  const prioritizedIds = new Set(prioritized.map((claim: any) => String(claim?.id || '')))
  return [...prioritized, ...rows.filter((claim) => !prioritizedIds.has(String(claim?.id || '')))]
}

export function requiredResearchReportHeadings(): string[] {
  return [...REQUIRED_RESEARCH_REPORT_HEADINGS]
}

function normalizeClaims(claims: any[] | undefined): any[] {
  const rows = Array.isArray(claims) ? claims : []
  const normalized = rows.map((claim, index) => ({
    id: String(claim?.id || `claim-${index + 1}`),
    claim: String(claim?.claim || claim?.title || `Research claim ${index + 1} remains evidence-bound.`),
    source_ids: normalizeIds(claim?.source_ids),
    counterevidence_ids: normalizeIds(claim?.counterevidence_ids),
    test_or_probe: String(claim?.test_or_probe || '')
  })).filter((claim) => claim.id)
  if (normalized.length >= 8) return normalized
  return [
    ...normalized,
    ...Array.from({ length: 8 - normalized.length }, (_unused, index) => ({
      id: `claim-${normalized.length + index + 1}`,
      claim: `Research synthesis claim ${normalized.length + index + 1} must remain tied to source-ledger evidence and a validation probe.`,
      source_ids: [],
      counterevidence_ids: [],
      test_or_probe: 'Run the matching research quality gate.'
    }))
  ]
}

function normalizeIds(value: any): string[] {
  return [...new Set((Array.isArray(value) ? value : value == null ? [] : [value]).map((item) => String(item || '').trim()).filter(Boolean))]
}

function fallbackIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_unused, index) => `${prefix}-${index + 1}`)
}
