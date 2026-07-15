import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { buildSsotGuard } from '../../safety/ssot-guard.js'
import { buildSubagentEvidence } from '../../subagents/subagent-evidence.js'
import { writeReleaseClosureManifest } from '../main-push-guard.js'

export const RELEASE_MISSION_ID = 'M-20260715-150100-34bb'
const statuses = ['fixed', 'not_reproducible_with_evidence', 'accepted_risk_with_expiry', 'deferred_because_out_of_scope']
const p0 = new Set(['F-001', 'F-002', 'F-003', 'F-006', 'F-009', 'F-013', 'F-015', 'F-018', 'F-019', 'F-020', 'F-025', 'F-027'])
const p2 = new Set(['F-017', 'F-023'])
const lineCount = 3021

export function writeReleaseClosureFixture(input: {
  root: string
  baseline: string
  sourceCommit: string
  removedModules?: string[]
  removedLines?: number
}) {
  excludeIgnoredFixtureArtifacts(input.root)
  const mission = path.join(input.root, '.sneakoscope', 'missions', RELEASE_MISSION_ID)
  const audit = path.join(input.root, '.sneakoscope', 'release', '6.3.0', 'audit')
  const proofs = path.join(input.root, '.sneakoscope', 'reports', 'release-closure')
  const rollout = path.join(input.root, '.codex', 'sessions', 'release-fixture-rollout.jsonl')
  fs.mkdirSync(mission, { recursive: true })
  fs.mkdirSync(audit, { recursive: true })
  fs.mkdirSync(proofs, { recursive: true })
  fs.mkdirSync(path.dirname(rollout), { recursive: true })

  const findingProofs = Array.from({ length: 28 }, (_, index) => {
    const findingId = `F-${String(index + 1).padStart(3, '0')}`
    return writeEvidence(input.root, path.join(proofs, 'findings', `${findingId}.json`), {
      schema: 'sks.release-finding-proof.v1',
      ok: true,
      source_commit: input.sourceCommit,
      mission_id: RELEASE_MISSION_ID,
      finding_id: findingId,
      status: 'fixed',
      blockers: []
    })
  })
  write(path.join(audit, 'findings.json'), {
    schema: 'sks.release-findings.v1',
    baseline: input.baseline,
    source_commit: input.sourceCommit,
    mission_id: RELEASE_MISSION_ID,
    captured_before_product_implementation: true,
    allowed_terminal_statuses: statuses,
    findings: findingProofs.map((proof, index) => {
      const id = `F-${String(index + 1).padStart(3, '0')}`
      return {
        id,
        severity: p0.has(id) ? 'P0' : p2.has(id) ? 'P2' : 'P1',
        status: 'fixed',
        closure: { commit: input.sourceCommit, proof: [proof] }
      }
    })
  })

  const deletion = deletionTruth(input.root, input.baseline, input.sourceCommit)
  write(path.join(audit, 'overengineering-deletions.json'), {
    schema: 'sks.release-overengineering-deletions.v1',
    baseline: input.baseline,
    source_commit: input.sourceCommit,
    counting_semantics: 'git_diff_deleted_files_numstat_v1',
    removed_modules: deletion.modules,
    removed_file_count: deletion.modules.length,
    removed_lines: deletion.pureDeletionLines,
    total_diff_deletions: deletion.totalDeletions,
    removed_path_manifest_sha256: deletion.pathManifestSha256,
    avoided_dependencies: [],
    avoided_background_processes: [],
    avoided_state_stores: []
  })

  const runId = 'naruto-release-fixture'
  const threads = [
    { id: 'thread-a', slice: 'release-guard', agent: 'release_guard', path: '/root/release_guard' },
    { id: 'thread-b', slice: 'evidence-audit', agent: 'evidence_auditor', path: '/root/evidence_auditor' },
    { id: 'thread-c', slice: 'retired-surface', agent: 'retired_surface_auditor', path: '/root/retired_surface_auditor' }
  ]
  write(path.join(mission, 'mission.json'), {
    id: RELEASE_MISSION_ID,
    mode: 'naruto',
    phase: 'NARUTO_COMPLETE',
    implementation_allowed: true,
    completion: { status: 'completed', mission_id: RELEASE_MISSION_ID, source_commit: input.sourceCommit }
  })
  write(path.join(mission, 'subagent-plan.json'), {
    schema: 'sks.subagent-plan.v1',
    mission_id: RELEASE_MISSION_ID,
    route: '$Naruto',
    workflow: 'official_codex_subagent',
    workflow_run_id: runId,
    requested_subagents: 3,
    max_depth: 1,
    parent_model_match: true,
    observed_parent_model: 'gpt-5.6-sol-max',
    config_blockers: [],
    agents: Object.fromEntries(threads.map((thread) => [thread.agent, { description: `${thread.slice} fixture role` }])),
    slices: threads.map((thread) => ({
      id: thread.slice,
      title: `${thread.slice} fixture`,
      description: `Verify ${thread.slice}`,
      agent: thread.agent,
      thread_id: thread.id,
      agent_path: thread.path
    }))
  })

  const lifecycle = writeRolloutAndEvents(rollout, runId, threads)
  fs.writeFileSync(path.join(mission, 'subagent-events.jsonl'), `${lifecycle.events.map((event) => JSON.stringify(event)).join('\n')}\n`)
  const parentSummary = {
    schema: 'sks.subagent-parent-summary.v1',
    status: 'completed',
    run_id: runId,
    summary: 'Completion Summary: release closure fixture. Honest Mode: verified.',
    thread_outcomes: threads.map((thread) => ({ thread_id: thread.id, status: 'completed', summary: `${thread.slice} verified` })),
    changed_files: ['release.txt'],
    verification: ['focused release closure tests passed'],
    blockers: []
  }
  write(path.join(mission, 'subagent-parent-summary.json'), parentSummary)
  write(path.join(mission, 'subagent-evidence.json'), {
    ...buildSubagentEvidence({
      requestedSubagents: 3,
      events: lifecycle.events,
      parentSummary,
      parentSummaryPresent: true,
      workflowStatus: 'completed',
      preparationOnly: false,
      runId
    }),
    mission_id: RELEASE_MISSION_ID
  })
  const parentThreadOutcomes = parentSummary.thread_outcomes.map((row) => ({ ...row }))
  write(path.join(mission, 'naruto-summary.json'), {
    schema: 'sks.naruto-subagent-workflow.v1',
    ok: true,
    completion_evidence: true,
    status: 'completed',
    route: '$Naruto',
    workflow: 'official_codex_subagent',
    workflow_run_id: runId,
    mission_id: RELEASE_MISSION_ID,
    requested_subagents: 3,
    parent_summary_present: true,
    parent_thread_outcomes: parentThreadOutcomes,
    blockers: []
  })
  write(path.join(mission, 'naruto-gate.json'), {
    schema: 'sks.naruto-gate.v1',
    route: '$Naruto',
    workflow: 'official_codex_subagent',
    workflow_run_id: runId,
    mission_id: RELEASE_MISSION_ID,
    status: 'passed',
    passed: true,
    terminal: true,
    terminal_state: 'completed',
    official_subagent_evidence: true,
    subagent_evidence_ready: true,
    parent_summary_present: true,
    session_cleanup: true,
    ssot_guard: true,
    native_process_proof_required: false,
    requested_subagents: 3,
    started_subagents: 3,
    completed_subagents: 3,
    failed_subagents: 0,
    blockers: []
  })
  write(path.join(mission, 'ssot-guard.json'), buildSsotGuard({ route: 'Naruto', mode: 'NARUTO', task: 'release fixture' }))

  const attachment = path.join(proofs, 'release-work-order.md')
  const sourceLines = Array.from({ length: lineCount }, (_, index) => `release work order fixture line ${index + 1}`)
  fs.writeFileSync(attachment, `${sourceLines.join('\n')}\n`)
  const workOrderSha256 = fileSha256(attachment)
  const workOrderProofs = Array.from({ length: 28 }, (_, index) => {
    const workOrderId = `WO-${String(index).padStart(3, '0')}`
    return writeEvidence(input.root, path.join(proofs, 'work-orders', `${workOrderId}.json`), {
      schema: 'sks.release-work-order-proof.v1',
      ok: true,
      source_commit: input.sourceCommit,
      mission_id: RELEASE_MISSION_ID,
      work_order_id: workOrderId,
      evidence_kind: 'both',
      blockers: []
    })
  })
  write(path.join(mission, 'work-order-ledger.json'), {
    schema_version: 1,
    mission_id: RELEASE_MISSION_ID,
    route: 'Naruto',
    created_at: new Date().toISOString(),
    source_path: attachment,
    source_sha256: workOrderSha256,
    source_line_count: lineCount,
    source_commit: input.sourceCommit,
    source_inventory_complete: true,
    all_customer_requests_preserved: true,
    all_customer_requests_mapped: true,
    all_work_items_resolved: true,
    all_work_items_verified: true,
    items: Array.from({ length: 28 }, (_, index) => {
      const start = index < 26 ? Math.floor(index * lineCount / 26) + 1 : null
      const end = index < 26 ? Math.floor((index + 1) * lineCount / 26) : null
      const source = index < 26
        ? {
            type: 'attachment',
            line_start: start,
            line_end: end,
            slice_sha256: hashText(`${sourceLines.slice(Number(start) - 1, Number(end)).join('\n')}\n`)
          }
        : { type: 'chat_text', verbatim: `customer request ${index - 25}` }
      return {
        id: `WO-${String(index).padStart(3, '0')}`,
        source,
        normalized_requirement: `requirement ${index}`,
        implementation_tasks: ['implement'],
        status: 'verified',
        implementation_evidence: [workOrderProofs[index]],
        verification_evidence: [workOrderProofs[index]]
      }
    })
  })

  const manifest = writeReleaseClosureManifest({
    root: input.root,
    version: '6.3.0',
    baseline: input.baseline,
    sourceCommit: input.sourceCommit,
    missionId: RELEASE_MISSION_ID
  })
  git(input.root, ['add', '-f', '--', '.sneakoscope/release/6.3.0'])
  git(input.root, ['commit', '-m', 'release closure evidence'])
  const head = gitText(input.root, ['rev-parse', 'HEAD'])
  return {
    audit,
    mission,
    proof: findingProofs[0]?.path || '',
    findingProofs,
    workOrderProofs,
    workOrderSha256,
    attachment,
    rollout,
    manifest,
    sourceCommit: input.sourceCommit,
    head
  }
}

export function readFixtureJson(file: string) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export function writeFixtureJson(file: string, value: unknown) {
  write(file, value)
}

function writeRolloutAndEvents(rollout: string, runId: string, threads: Array<{ id: string; path: string }>) {
  const rows: any[] = []
  const descriptors: Array<{ eventName: 'SubagentStart' | 'SubagentStop'; thread: { id: string; path: string }; eventId: string }> = []
  for (const [index, thread] of threads.entries()) {
    const eventId = `start-${index + 1}`
    const timestamp = `2026-07-15T17:0${index + 5}:00.000Z`
    rows.push({
      timestamp,
      type: 'event_msg',
      payload: { type: 'sub_agent_activity', kind: 'started', agent_thread_id: thread.id, agent_path: thread.path, event_id: eventId }
    })
    descriptors.push({ eventName: 'SubagentStart', thread, eventId })
  }
  for (const [index, thread] of threads.entries()) {
    const eventId = `stop-${index + 1}`
    const timestamp = `2026-07-15T17:1${index + 5}:00.000Z`
    rows.push({
      timestamp,
      type: 'response_item',
      payload: { type: 'agent_message', author: thread.path, content: [{ type: 'output_text', text: 'FINAL_ANSWER: completed' }] }
    })
    descriptors.push({ eventName: 'SubagentStop', thread, eventId })
  }
  const lines = rows.map((row) => JSON.stringify(row))
  fs.writeFileSync(rollout, `${lines.join('\n')}\n`)
  const events = descriptors.map((descriptor, index) => ({
    schema: 'sks.subagent-event.v1',
    event_name: descriptor.eventName,
    thread_id: descriptor.thread.id,
    run_id: runId,
    outcome: descriptor.eventName === 'SubagentStart' ? 'started' : 'stopped',
    occurred_at: rows[index].timestamp,
    provenance: {
      schema: 'sks.codex-rollout-event-proof.v1',
      rollout_path: rollout,
      line: index + 1,
      line_sha256: hashText(lines[index] || ''),
      rollout_prefix_sha256: hashText(`${lines.slice(0, index + 1).join('\n')}\n`),
      agent_path: descriptor.thread.path,
      event_id: descriptor.eventId
    }
  }))
  return { events }
}

function writeEvidence(root: string, file: string, value: { schema: string; source_commit: string; mission_id: string } & Record<string, unknown>) {
  write(file, value)
  return {
    path: path.relative(root, file).split(path.sep).join('/'),
    sha256: fileSha256(file),
    line_count: fileLineCount(file),
    schema: value.schema,
    source_commit: value.source_commit,
    mission_id: value.mission_id
  }
}

function deletionTruth(root: string, baseline: string, sourceCommit: string) {
  const modules = gitText(root, ['diff', '--find-renames', '--name-only', '--diff-filter=D', baseline, sourceCommit])
    .split(/\r?\n/).filter(Boolean).sort()
  const pureDeletionLines = numstatDeletions(gitText(root, ['diff', '--find-renames', '--numstat', '--diff-filter=D', baseline, sourceCommit]))
  const totalDeletions = numstatDeletions(gitText(root, ['diff', '--find-renames', '--numstat', baseline, sourceCommit]))
  return {
    modules,
    pureDeletionLines,
    totalDeletions,
    pathManifestSha256: hashText(modules.length ? `${modules.join('\n')}\n` : '')
  }
}

function excludeIgnoredFixtureArtifacts(root: string) {
  const exclude = path.join(root, '.git', 'info', 'exclude')
  fs.mkdirSync(path.dirname(exclude), { recursive: true })
  fs.appendFileSync(exclude, '\n.sneakoscope/missions/\n.sneakoscope/reports/\n.codex/sessions/\n')
}

function numstatDeletions(value: string) {
  return value.split(/\r?\n/).reduce((total, row) => {
    const deleted = row.split('\t')[1]
    return total + (deleted && /^\d+$/.test(deleted) ? Number(deleted) : 0)
  }, 0)
}

function write(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function git(root: string, args: string[]) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(String(result.stderr || result.stdout || `git ${args.join(' ')} failed`))
}

function gitText(root: string, args: string[]) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(String(result.stderr || result.stdout || `git ${args.join(' ')} failed`))
  return String(result.stdout || '').trim()
}

function fileSha256(file: string) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function fileLineCount(file: string) {
  const value = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  if (!value) return 0
  return value.endsWith('\n') ? value.slice(0, -1).split('\n').length : value.split('\n').length
}

function hashText(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}
