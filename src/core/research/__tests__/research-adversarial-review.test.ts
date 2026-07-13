import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fsp from 'node:fs/promises'
import {
  buildResearchHonestMode,
  evaluateReviewCycle,
  parseOfficialReviewParentSummary,
  runResearchAdversarialReviewLoop
} from '../research-adversarial-review.js'
import { recordSubagentEvent } from '../../subagents/subagent-evidence.js'

const digestFixture = {
  schema: 'sks.research-review-artifact-digest.v1' as const,
  generated_at: '2026-07-13T00:00:00.000Z',
  artifacts: [
    { artifact: 'research-report.md', sha256: '1'.repeat(64), bytes: 10 },
    { artifact: 'research-paper.md', sha256: '2'.repeat(64), bytes: 10 },
    { artifact: 'source-ledger.json', sha256: '3'.repeat(64), bytes: 10 },
    { artifact: 'claim-evidence-matrix.json', sha256: '4'.repeat(64), bytes: 10 }
  ],
  bundle_sha256: 'a'.repeat(64),
  blockers: []
}

test('mock adversarial loop records five structured outcomes without making genius or novelty guarantees', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-research-adversarial-'))
  const plan = { mission_id: 'M-RESEARCH-ADVERSARIAL', prompt: 'bounded evidence research', artifacts: { research_paper: 'research-paper.md' } }
  const sources = Array.from({ length: 8 }, (_unused, index) => ({ id: `source-${index + 1}` }))
  await fsp.writeFile(path.join(dir, 'source-ledger.json'), JSON.stringify({ sources, counterevidence_sources: [] }))
  await fsp.writeFile(path.join(dir, 'claim-evidence-matrix.json'), JSON.stringify({ schema: 'sks.claim-evidence-matrix.v1', claims: [] }))
  await fsp.writeFile(path.join(dir, 'research-report.md'), '# Report\n\nEvidence-bound fixture.')
  await fsp.writeFile(path.join(dir, 'research-paper.md'), '# Paper\n\nEvidence-bound fixture.')
  const result = await runResearchAdversarialReviewLoop({ root: dir, dir, plan, timeoutMs: 1000, mock: true })
  assert.equal(result.gate.passed, true)
  assert.equal(result.gate.reviewer_count_observed, 5)
  assert.equal(result.gate.genius_level_guaranteed, false)
  assert.equal(result.gate.novelty_guaranteed, false)
  const debate = JSON.parse(await fsp.readFile(path.join(dir, 'debate-ledger.json'), 'utf8'))
  assert.equal(debate.unanimous_consensus, true)
  assert.equal(debate.exchanges.length, 5)
})

test('structured reviewer convergence fails closed on a critical objection', () => {
  const reviewers = ['einstein', 'feynman', 'turing', 'von_neumann', 'skeptic'].map((personaId, index) => ({
    schema: 'sks.research-adversarial-reviewer-outcome.v1',
    persona_id: personaId,
    verdict: index === 0 ? 'revise' : 'approve',
    strongest_challenge: 'Attempted falsification',
    evidence_source_ids: ['source-1'],
    critical_objections: index === 0 ? [{ id: 'critical-1', severity: 'critical', claim_ids: ['claim-1'], source_ids: ['source-1'], reason: 'missing control', required_revision: 'add or downgrade control claim' }] : [],
    major_objections: [],
    minor_objections: [],
    required_revisions: [],
    eureka: { exclamation: 'Eureka!', idea: 'bounded insight', source_ids: ['source-1'] },
    falsifiers: ['counterexample'],
    cheap_probes: ['probe'],
    confidence: 'high',
    review_artifact_bundle_sha256: digestFixture.bundle_sha256,
    thread_id: `thread-${index + 1}`,
    thread_status: 'completed'
  }))
  const result = evaluateReviewCycle({ reviewers, review_artifacts: digestFixture, blockers: [] }, new Set(['source-1']))
  assert.equal(result.ok, false)
  assert.equal(result.critical_objections, 1)
  assert.ok(result.blockers.includes('critical_objections_unresolved'))
})

test('official parent summary parser rejects prose-only thread outcomes', () => {
  const parsed = parseOfficialReviewParentSummary(JSON.stringify({
    schema: 'sks.subagent-parent-summary.v1',
    status: 'completed',
    summary: 'done',
    thread_outcomes: [{ thread_id: 'thread-1', status: 'completed', summary: 'looks good' }],
    changed_files: [],
    verification: [],
    blockers: []
  }))
  assert.equal(parsed.ok, false)
  assert.ok(parsed.blockers.some((blocker) => blocker.startsWith('reviewer_outcome_unstructured:')))
})

test('official reviewer parser rejects prose-wrapped parent JSON, wrong reviewer schema, and duplicate threads', () => {
  const ids = ['einstein', 'feynman', 'turing', 'von_neumann', 'skeptic']
  const outcome = (personaId: string) => ({
    schema: 'wrong.schema',
    persona_id: personaId,
    verdict: 'approve',
    strongest_challenge: 'challenge',
    evidence_source_ids: ['source-1'],
    critical_objections: [],
    major_objections: [],
    minor_objections: [],
    required_revisions: [],
    eureka: { exclamation: 'Eureka!', idea: 'idea', source_ids: ['source-1'] },
    falsifiers: ['falsifier'],
    cheap_probes: ['probe'],
    confidence: 'high',
    review_artifact_bundle_sha256: digestFixture.bundle_sha256
  })
  const parent = {
    schema: 'sks.subagent-parent-summary.v1',
    status: 'completed',
    summary: 'done',
    thread_outcomes: ids.map((id) => ({ thread_id: 'same-thread', status: 'completed', summary: JSON.stringify(outcome(id)) })),
    changed_files: [],
    verification: [],
    blockers: []
  }
  const proseWrapped = parseOfficialReviewParentSummary(`prefix ${JSON.stringify(parent)} suffix`)
  assert.equal(proseWrapped.ok, false)
  assert.ok(proseWrapped.blockers.includes('official_subagent_parent_summary_invalid'))

  const exact = parseOfficialReviewParentSummary(JSON.stringify(parent))
  assert.equal(exact.ok, false)
  assert.ok(exact.blockers.some((blocker) => blocker.includes('parent_thread_outcome_duplicate:same-thread')))

  const wrongSchema = parseOfficialReviewParentSummary(JSON.stringify({
    ...parent,
    thread_outcomes: ids.map((id, index) => ({ thread_id: `thread-${index + 1}`, status: 'completed', summary: JSON.stringify(outcome(id)) }))
  }))
  assert.equal(wrongSchema.ok, false)
  assert.ok(wrongSchema.blockers.some((blocker) => blocker.startsWith('reviewer_schema_invalid:')))
})

test('approve with a major objection remains blocked and revisable', () => {
  const reviewers = ['einstein', 'feynman', 'turing', 'von_neumann', 'skeptic'].map((personaId, index) => ({
    schema: 'sks.research-adversarial-reviewer-outcome.v1' as const,
    persona_id: personaId,
    verdict: 'approve' as const,
    strongest_challenge: 'Attempted falsification',
    evidence_source_ids: ['source-1'],
    critical_objections: [],
    major_objections: index === 0 ? [{ id: 'major-1', severity: 'major' as const, claim_ids: ['claim-1'], source_ids: ['source-1'], reason: 'material flaw', required_revision: 'fix the material flaw' }] : [],
    minor_objections: [],
    required_revisions: [],
    eureka: { exclamation: 'Eureka!' as const, idea: 'bounded insight', source_ids: ['source-1'] },
    falsifiers: ['counterexample'],
    cheap_probes: ['probe'],
    confidence: 'high' as const,
    review_artifact_bundle_sha256: digestFixture.bundle_sha256,
    thread_id: `thread-${index + 1}`,
    thread_status: 'completed' as const
  }))
  const result = evaluateReviewCycle({ reviewers, review_artifacts: digestFixture, blockers: [] }, new Set(['source-1']))
  assert.equal(result.ok, false)
  assert.equal(result.open_objections, 1)
  assert.equal(result.revisable, true)
  assert.ok(result.blockers.includes('major_objections_unresolved'))
})

test('review convergence rejects stale artifact digests and source IDs outside the current ledger', () => {
  const reviewers = ['einstein', 'feynman', 'turing', 'von_neumann', 'skeptic'].map((personaId, index) => ({
    schema: 'sks.research-adversarial-reviewer-outcome.v1' as const,
    persona_id: personaId,
    verdict: 'approve' as const,
    strongest_challenge: 'Attempted falsification',
    evidence_source_ids: [index === 0 ? 'unknown-source' : 'source-1'],
    critical_objections: [],
    major_objections: [],
    minor_objections: [],
    required_revisions: [],
    eureka: { exclamation: 'Eureka!' as const, idea: 'bounded insight', source_ids: ['source-1'] },
    falsifiers: ['counterexample'],
    cheap_probes: ['probe'],
    confidence: 'high' as const,
    review_artifact_bundle_sha256: 'b'.repeat(64),
    thread_id: `thread-${index + 1}`,
    thread_status: 'completed' as const
  }))
  const result = evaluateReviewCycle({ reviewers, review_artifacts: digestFixture, blockers: [] }, new Set(['source-1']))
  assert.equal(result.ok, false)
  assert.ok(result.blockers.includes('reviewer_artifact_bundle_sha256_mismatch:einstein'))
  assert.ok(result.blockers.includes('reviewer_evidence_source_unknown:einstein:unknown-source'))
})

test('real review convergence requires five distinct lifecycle-correlated official threads', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-research-adversarial-real-'))
  await fsp.mkdir(path.join(dir, '.codex', 'agents'), { recursive: true })
  await fsp.writeFile(path.join(dir, '.codex', 'agents', 'expert.toml'), [
    'name = "expert"',
    'model = "gpt-5.6-sol"',
    'model_reasoning_effort = "max"'
  ].join('\n'))
  const plan = { mission_id: 'M-RESEARCH-LIFECYCLE', prompt: 'bounded evidence research', artifacts: { research_paper: 'research-paper.md' } }
  const sources = Array.from({ length: 8 }, (_unused, index) => ({ id: `source-${index + 1}` }))
  await fsp.writeFile(path.join(dir, 'source-ledger.json'), JSON.stringify({ sources, counterevidence_sources: [] }))
  await fsp.writeFile(path.join(dir, 'claim-evidence-matrix.json'), JSON.stringify({ schema: 'sks.claim-evidence-matrix.v1', claims: [] }))
  await fsp.writeFile(path.join(dir, 'research-report.md'), '# Report\n\nEvidence-bound fixture.')
  await fsp.writeFile(path.join(dir, 'research-paper.md'), '# Paper\n\nEvidence-bound fixture.')
  const result = await runResearchAdversarialReviewLoop({
    root: dir,
    dir,
    plan,
    timeoutMs: 1000,
    maxCycles: 1,
    appSession: false,
    runWorkflowImpl: async (workflow) => {
      const subagentPlan = JSON.parse(await fsp.readFile(path.join(dir, 'subagent-plan.json'), 'utf8'))
      const artifactBundle = subagentPlan.review_artifacts.bundle_sha256
      assert.match(workflow.prompt, new RegExp(artifactBundle))
      const ids = ['einstein', 'feynman', 'turing', 'von_neumann', 'skeptic']
      const threadOutcomes = []
      for (const [index, personaId] of ids.entries()) {
        const threadId = `official-thread-${index + 1}`
        await recordSubagentEvent(dir, { thread_id: threadId, workflow_run_id: subagentPlan.workflow_run_id }, 'SubagentStart')
        await recordSubagentEvent(dir, { thread_id: threadId, workflow_run_id: subagentPlan.workflow_run_id }, 'SubagentStop')
        threadOutcomes.push({
          thread_id: threadId,
          status: 'completed',
          summary: JSON.stringify({
            schema: 'sks.research-adversarial-reviewer-outcome.v1',
            persona_id: personaId,
            verdict: 'approve',
            strongest_challenge: 'Attempted source-linked falsification.',
            evidence_source_ids: [`source-${index + 1}`],
            critical_objections: [],
            major_objections: [],
            minor_objections: [],
            required_revisions: [],
            eureka: { exclamation: 'Eureka!', idea: 'A bounded source-linked insight.', source_ids: [`source-${index + 1}`] },
            falsifiers: ['Remove the cited evidence.'],
            cheap_probes: ['Re-run the cited source check.'],
            confidence: 'high',
            review_artifact_bundle_sha256: artifactBundle
          })
        })
      }
      return {
        schema: 'sks.subagent-workflow.v1',
        workflow: 'official_codex_subagent',
        ok: true,
        status: 'parent_completed',
        prepared: false,
        codex_exit_code: 0,
        parent_summary: JSON.stringify({
          schema: 'sks.subagent-parent-summary.v1',
          status: 'completed',
          summary: 'All five independent reviewer threads completed.',
          thread_outcomes: threadOutcomes,
          changed_files: [],
          verification: [],
          blockers: []
        })
      }
    }
  })
  assert.equal(result.gate.passed, true, JSON.stringify(result.gate))
  assert.equal(result.gate.official_subagent_evidence_ok, true)
  assert.equal(result.review_cycles[0].subagent_evidence.completed_threads, 5)
  assert.equal(new Set(result.review_cycles[0].reviewers.map((reviewer: any) => reviewer.thread_id)).size, 5)
})

test('adversarial review uses one absolute cycle deadline and fails closed after it expires', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-research-adversarial-timeout-'))
  await fsp.mkdir(path.join(dir, '.codex', 'agents'), { recursive: true })
  await fsp.writeFile(path.join(dir, '.codex', 'agents', 'expert.toml'), 'model = "gpt-5.6-sol"\nmodel_reasoning_effort = "max"\n')
  const plan = { mission_id: 'M-RESEARCH-TIMEOUT', prompt: 'bounded evidence research', artifacts: { research_paper: 'research-paper.md' } }
  await fsp.writeFile(path.join(dir, 'source-ledger.json'), JSON.stringify({ sources: [{ id: 'source-1' }], counterevidence_sources: [] }))
  await fsp.writeFile(path.join(dir, 'claim-evidence-matrix.json'), JSON.stringify({ schema: 'sks.claim-evidence-matrix.v1', claims: [] }))
  await fsp.writeFile(path.join(dir, 'research-report.md'), '# Report\n\nEvidence-bound fixture.')
  await fsp.writeFile(path.join(dir, 'research-paper.md'), '# Paper\n\nEvidence-bound fixture.')
  const observedTimeouts: number[] = []
  const result = await runResearchAdversarialReviewLoop({
    root: dir,
    dir,
    plan,
    timeoutMs: 15,
    maxCycles: 1,
    appSession: false,
    runWorkflowImpl: async (workflow) => {
      observedTimeouts.push(Number(workflow.timeoutMs))
      await new Promise((resolve) => setTimeout(resolve, 25))
      return { status: 'failed', prepared: false, codex_exit_code: 1, parent_summary: null }
    }
  })
  assert.equal(observedTimeouts.length, 1)
  assert.ok(observedTimeouts[0]! <= 15 && observedTimeouts[0]! > 0)
  assert.equal(result.gate.passed, false)
  assert.ok(result.gate.blockers.includes('research_cycle_timeout_exceeded'), JSON.stringify(result.gate))
})

test('Research Honest Mode distinguishes disclaimers from English and Korean overclaims', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-research-honest-mode-'))
  const plan = { artifacts: { research_paper: 'research-paper.md' } }
  await fsp.writeFile(path.join(dir, 'research-report.md'), 'We do not guarantee novelty or publication acceptance.')
  await fsp.writeFile(path.join(dir, 'research-paper.md'), 'This is not proven to be a breakthrough result.')
  const disclaimer = await buildResearchHonestMode(dir, plan, 'real')
  assert.equal(disclaimer.ok, true, JSON.stringify(disclaimer))

  await fsp.writeFile(path.join(dir, 'research-report.md'), '이 연구는 아인슈타인급 천재성과 세계 최초 혁신 논문임을 보장한다.')
  const overclaim = await buildResearchHonestMode(dir, plan, 'real')
  assert.equal(overclaim.ok, false)
  assert.ok(overclaim.blockers.some((blocker) => blocker.startsWith('unsupported_genius_or_novelty_claim:')))

  for (const text of [
    'This is a world-first breakthrough paper.',
    'This revolutionary discovery establishes a novel theory.',
    'Peer reviewers will certainly accept this paper.'
  ]) {
    await fsp.writeFile(path.join(dir, 'research-report.md'), text)
    const englishOverclaim = await buildResearchHonestMode(dir, plan, 'real')
    assert.equal(englishOverclaim.ok, false, text)
  }

  await fsp.writeFile(path.join(dir, 'research-report.md'), 'This is not a world-first breakthrough paper, and peer reviewers will not necessarily accept it.')
  const negative = await buildResearchHonestMode(dir, plan, 'real')
  assert.equal(negative.ok, true, JSON.stringify(negative))

  await fsp.writeFile(path.join(dir, 'research-report.md'), 'Our paper establishes novelty.')
  await fsp.writeFile(path.join(dir, 'claim-evidence-matrix.json'), JSON.stringify({
    key_claim_ids: ['claim-1'],
    claims: [{ id: 'claim-1', claim: 'A bounded mechanism remains testable.' }]
  }))
  await fsp.writeFile(path.join(dir, 'novelty-ledger.json'), JSON.stringify({ entries: [{ id: 'claim-1', novelty: 3 }] }))
  await fsp.writeFile(path.join(dir, 'source-ledger.json'), JSON.stringify({ sources: [], counterevidence_sources: [] }))
  const unsupportedNovelty = await buildResearchHonestMode(dir, plan, 'real')
  assert.equal(unsupportedNovelty.ok, false)
  assert.ok(unsupportedNovelty.blockers.some((blocker: string) => blocker.startsWith('novelty_claim_without_prior_art_proof:')))
  assert.equal(unsupportedNovelty.prior_art_proof.coverage_complete, false)
})
