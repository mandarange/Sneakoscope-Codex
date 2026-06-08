import path from 'node:path'
import { readJson, writeJsonAtomic, writeTextAtomic, nowIso } from '../fsx.js'
import { runCodexTask } from '../codex-control/codex-task-runner.js'
import { researchPaperArtifactForPlan } from '../research.js'
import { analyzeResearchReportQuality, countWords } from './research-report-quality.js'
import { analyzeResearchRepetition } from './research-repetition-detector.js'
import { buildRealisticResearchPaper, buildRealisticResearchReport } from './research-realistic-report.js'
import { buildResearchSynthesisPrompt } from './research-synthesis-prompt.js'

export interface ResearchSynthesisOutput {
  schema: 'sks.research-synthesis-output.v1'
  mission_id: string
  generated_at: string
  report_markdown: string
  paper_markdown: string
  synthesis_summary: {
    key_claim_ids: string[]
    source_ids_used: string[]
    counterevidence_ids_used: string[]
    blueprint_sections_used: string[]
    experiment_steps_used: string[]
  }
  quality_signals: {
    report_word_count: number
    source_citation_count: number
    unique_source_ids_cited: number
    key_claims_covered: number
    repeated_paragraph_ratio: number
    template_phrase_hits: string[]
  }
  blockers: string[]
}

export const researchSynthesisOutputSchema = {
  type: 'object',
  required: ['schema', 'mission_id', 'generated_at', 'report_markdown', 'paper_markdown', 'synthesis_summary', 'quality_signals', 'blockers'],
  properties: {
    schema: { const: 'sks.research-synthesis-output.v1' },
    mission_id: { type: 'string' },
    generated_at: { type: 'string' },
    report_markdown: { type: 'string' },
    paper_markdown: { type: 'string' },
    synthesis_summary: {
      type: 'object',
      required: ['key_claim_ids', 'source_ids_used', 'counterevidence_ids_used', 'blueprint_sections_used', 'experiment_steps_used'],
      properties: {
        key_claim_ids: { type: 'array', items: { type: 'string' } },
        source_ids_used: { type: 'array', items: { type: 'string' } },
        counterevidence_ids_used: { type: 'array', items: { type: 'string' } },
        blueprint_sections_used: { type: 'array', items: { type: 'string' } },
        experiment_steps_used: { type: 'array', items: { type: 'string' } }
      }
    },
    quality_signals: {
      type: 'object',
      required: ['report_word_count', 'source_citation_count', 'unique_source_ids_cited', 'key_claims_covered', 'repeated_paragraph_ratio', 'template_phrase_hits'],
      properties: {
        report_word_count: { type: 'number' },
        source_citation_count: { type: 'number' },
        unique_source_ids_cited: { type: 'number' },
        key_claims_covered: { type: 'number' },
        repeated_paragraph_ratio: { type: 'number' },
        template_phrase_hits: { type: 'array', items: { type: 'string' } }
      }
    },
    blockers: { type: 'array', items: { type: 'string' } }
  }
}

export async function runResearchCodexSynthesisWriter(input: {
  root: string
  dir: string
  plan: any
  cycle: number
  backendPreference?: Array<'codex-sdk' | 'python-codex-sdk'>
  timeoutMs?: number
  mock?: boolean
}): Promise<ResearchSynthesisOutput> {
  const artifacts = await readSynthesisInputs(input.dir)
  if (input.mock === true || input.plan?.backend === 'mock' || input.plan?.backend === 'deterministic') {
    const output = normalizeResearchSynthesisOutput(mockResearchSynthesisOutput(input.plan, artifacts))
    const validation = validateResearchSynthesisOutput(output, artifacts.contract, artifacts.claimMatrix, artifacts.sourceLedger)
    const merged = { ...output, blockers: [...new Set([...output.blockers, ...validation.blockers])] }
    await writeSynthesisArtifacts(input.dir, input.plan, merged)
    return merged
  }
  const result = await runCodexTask({
    route: '$Research',
    tier: 'worker',
    missionId: String(input.plan?.mission_id || 'research-synthesis'),
    workItemId: 'research_synthesis',
    cwd: input.root,
    prompt: buildResearchSynthesisPrompt({ ...artifacts, plan: input.plan, cycle: input.cycle }),
    outputSchema: researchSynthesisOutputSchema,
    outputSchemaId: 'sks.research-synthesis-output.v1',
    sandboxPolicy: 'read-only',
    requestedScopeContract: {
      id: 'research-synthesis',
      route: '$Research',
      read_only: true,
      allowed_paths: [`.sneakoscope/missions/${input.plan?.mission_id || ''}/`],
      write_paths: [],
      allowed_write_prefixes: [`.sneakoscope/missions/${input.plan?.mission_id || ''}/`],
      source_mutation_allowed: false
    },
    backendPreference: input.backendPreference || ['codex-sdk', 'python-codex-sdk'],
    allowLocalLlm: false,
    localLlmPolicy: { mode: 'disabled', requiresGptFinal: true },
    mutationLedgerRoot: path.join(input.dir, 'research', 'synthesis-codex-control'),
    reliabilityPolicy: { timeoutClass: 'standard', idleTimeoutMs: input.timeoutMs || 120000 }
  })
  const worker = await readJson(result.workerResultPath as string, null)
  const output = normalizeResearchSynthesisOutput(worker)
  const validation = validateResearchSynthesisOutput(output, artifacts.contract, artifacts.claimMatrix, artifacts.sourceLedger)
  const patchEnvelopeBlocker = Array.isArray(worker?.patch_envelopes) && worker.patch_envelopes.length ? ['research_synthesis_patch_envelope_forbidden'] : []
  const blockers = [...new Set([
    ...output.blockers,
    ...(Array.isArray(result.blockers) ? result.blockers.map(String) : []),
    ...validation.blockers,
    ...patchEnvelopeBlocker
  ])]
  const merged = { ...output, blockers }
  await writeSynthesisArtifacts(input.dir, input.plan, merged)
  return merged
}

export function normalizeResearchSynthesisOutput(value: any): ResearchSynthesisOutput {
  const reportMarkdown = String(value?.report_markdown || '')
  const paperMarkdown = String(value?.paper_markdown || '')
  const repetition = analyzeResearchRepetition(reportMarkdown)
  const sourceIdsUsed = normalizeStringList(value?.synthesis_summary?.source_ids_used || value?.source_ids_used)
  const keyClaimIds = normalizeStringList(value?.synthesis_summary?.key_claim_ids || value?.key_claim_ids)
  return {
    schema: 'sks.research-synthesis-output.v1',
    mission_id: String(value?.mission_id || ''),
    generated_at: String(value?.generated_at || nowIso()),
    report_markdown: reportMarkdown,
    paper_markdown: paperMarkdown,
    synthesis_summary: {
      key_claim_ids: keyClaimIds,
      source_ids_used: sourceIdsUsed,
      counterevidence_ids_used: normalizeStringList(value?.synthesis_summary?.counterevidence_ids_used || value?.counterevidence_ids_used),
      blueprint_sections_used: normalizeStringList(value?.synthesis_summary?.blueprint_sections_used || value?.blueprint_sections_used),
      experiment_steps_used: normalizeStringList(value?.synthesis_summary?.experiment_steps_used || value?.experiment_steps_used)
    },
    quality_signals: {
      report_word_count: Number(value?.quality_signals?.report_word_count || countWords(reportMarkdown)),
      source_citation_count: Number(value?.quality_signals?.source_citation_count || sourceCitationCount(reportMarkdown)),
      unique_source_ids_cited: Number(value?.quality_signals?.unique_source_ids_cited || sourceIdsUsed.filter((id) => reportMarkdown.includes(id)).length),
      key_claims_covered: Number(value?.quality_signals?.key_claims_covered || keyClaimIds.filter((id) => reportMarkdown.includes(id)).length),
      repeated_paragraph_ratio: Number(value?.quality_signals?.repeated_paragraph_ratio ?? repetition.repeated_paragraph_ratio),
      template_phrase_hits: normalizeStringList(value?.quality_signals?.template_phrase_hits || repetition.template_phrase_hits)
    },
    blockers: normalizeStringList(value?.blockers)
  }
}

export function validateResearchSynthesisOutput(output: ResearchSynthesisOutput, contract: any = null, claimMatrix: any = null, sourceLedger: any = null): { ok: boolean; blockers: string[] } {
  const reportQuality = analyzeResearchReportQuality(output.report_markdown)
  const repetition = analyzeResearchRepetition(output.report_markdown)
  const sourceIds = sourceIdsFromLedger(sourceLedger)
  const keyClaims = Array.isArray(claimMatrix?.key_claim_ids) ? claimMatrix.key_claim_ids.map(String) : []
  const report = output.report_markdown
  const paper = output.paper_markdown
  const sourceIdsCited = sourceIds.filter((id) => report.includes(id))
  const keyClaimsCovered = keyClaims.filter((id: string) => report.includes(id) || claimSourceIds(claimMatrix, id).some((sourceId: string) => report.includes(sourceId)))
  const paperSections = ['Abstract', 'Introduction', 'Methodology', 'Findings', 'Discussion', 'Limitations', 'Conclusion', 'References']
  const blockers = [
    ...(output.schema === 'sks.research-synthesis-output.v1' ? [] : ['research_synthesis_schema_invalid']),
    ...(output.mission_id ? [] : ['research_synthesis_mission_missing']),
    ...(output.report_markdown.trim() ? [] : ['research_synthesis_report_missing']),
    ...(output.paper_markdown.trim() ? [] : ['research_synthesis_paper_missing']),
    ...(countWords(report) >= Number(contract?.min_report_words || 2200) ? [] : ['research_synthesis_report_too_short']),
    ...reportQuality.blockers,
    ...repetition.blockers,
    ...(sourceIdsCited.length >= Math.min(8, sourceIds.length) ? [] : ['research_synthesis_unique_sources_below_contract']),
    ...(keyClaimsCovered.length >= Number(contract?.min_key_claims || 8) ? [] : ['research_synthesis_key_claims_below_contract']),
    ...(repetition.repeated_paragraph_ratio <= 0.18 ? [] : ['research_synthesis_repeated_paragraph_ratio_high']),
    ...(repetition.template_phrase_hits.length ? ['research_synthesis_template_phrase_hits'] : []),
    ...(paperSections.every((heading) => paper.toLowerCase().includes(heading.toLowerCase())) ? [] : ['research_synthesis_paper_sections_missing']),
    ...output.blockers
  ]
  return { ok: blockers.length === 0, blockers: [...new Set(blockers)] }
}

async function readSynthesisInputs(dir: string) {
  return {
    sourceLedger: await readJson(path.join(dir, 'source-ledger.json'), null),
    claimMatrix: await readJson(path.join(dir, 'claim-evidence-matrix.json'), null),
    falsificationLedger: await readJson(path.join(dir, 'falsification-ledger.json'), null),
    implementationBlueprint: await readJson(path.join(dir, 'implementation-blueprint.json'), null),
    experimentPlan: await readJson(path.join(dir, 'experiment-plan.json'), null),
    replicationPack: await readJson(path.join(dir, 'replication-pack.json'), null),
    contract: await readJson(path.join(dir, 'research-quality-contract.json'), null)
  }
}

function mockResearchSynthesisOutput(plan: any, artifacts: any): ResearchSynthesisOutput {
  const claims = Array.isArray(artifacts.claimMatrix?.claims) ? artifacts.claimMatrix.claims : []
  const sourceIds = sourceIdsFromLedger(artifacts.sourceLedger)
  const counterIds = counterevidenceIdsFromLedger(artifacts.sourceLedger)
  const report = buildRealisticResearchReport({ plan, claims, sourceIds, counterevidenceIds: counterIds, blueprint: artifacts.implementationBlueprint, falsificationLedger: artifacts.falsificationLedger, experimentPlan: artifacts.experimentPlan, replicationPack: artifacts.replicationPack })
  const paper = buildRealisticResearchPaper({ plan, claims, sourceIds, counterevidenceIds: counterIds })
  return normalizeResearchSynthesisOutput({
    schema: 'sks.research-synthesis-output.v1',
    mission_id: String(plan?.mission_id || ''),
    generated_at: nowIso(),
    report_markdown: report,
    paper_markdown: paper,
    synthesis_summary: {
      key_claim_ids: (Array.isArray(artifacts.claimMatrix?.key_claim_ids) ? artifacts.claimMatrix.key_claim_ids : claims.slice(0, 8).map((claim: any) => claim.id)).map(String),
      source_ids_used: sourceIds,
      counterevidence_ids_used: counterIds,
      blueprint_sections_used: (Array.isArray(artifacts.implementationBlueprint?.sections) ? artifacts.implementationBlueprint.sections : []).map((section: any) => String(section.id || section.title || '')).filter(Boolean),
      experiment_steps_used: (Array.isArray(artifacts.experimentPlan?.steps) ? artifacts.experimentPlan.steps : []).map((step: any) => String(step.id || '')).filter(Boolean)
    },
    blockers: []
  })
}

async function writeSynthesisArtifacts(dir: string, plan: any, output: ResearchSynthesisOutput) {
  await writeJsonAtomic(path.join(dir, 'research-synthesis-output.json'), output)
  if (output.report_markdown.trim()) await writeTextAtomic(path.join(dir, 'research-report.md'), `${output.report_markdown.trim()}\n`)
  if (output.paper_markdown.trim()) await writeTextAtomic(path.join(dir, researchPaperArtifactForPlan(plan)), `${output.paper_markdown.trim()}\n`)
}

function sourceIdsFromLedger(sourceLedger: any): string[] {
  return normalizeStringList([
    ...(Array.isArray(sourceLedger?.sources) ? sourceLedger.sources : []),
    ...(Array.isArray(sourceLedger?.counterevidence_sources) ? sourceLedger.counterevidence_sources : [])
  ].map((row: any) => row?.id))
}

function counterevidenceIdsFromLedger(sourceLedger: any): string[] {
  return normalizeStringList((Array.isArray(sourceLedger?.counterevidence_sources) ? sourceLedger.counterevidence_sources : []).map((row: any) => row?.id))
}

function claimSourceIds(claimMatrix: any, claimId: string): string[] {
  const claim = (Array.isArray(claimMatrix?.claims) ? claimMatrix.claims : []).find((row: any) => String(row?.id || '') === claimId)
  return normalizeStringList([...(Array.isArray(claim?.source_ids) ? claim.source_ids : []), ...(Array.isArray(claim?.counterevidence_ids) ? claim.counterevidence_ids : [])])
}

function sourceCitationCount(text: string): number {
  return [...String(text || '').matchAll(/\b(?:source|src|mock-source|shard-[A-Za-z0-9_-]+|counter|mock-counter)-[A-Za-z0-9_.:-]+\b/g)].length
}

function normalizeStringList(value: any): string[] {
  return [...new Set((Array.isArray(value) ? value : value == null ? [] : [value]).flat().map((item) => String(item || '').trim()).filter(Boolean))]
}
