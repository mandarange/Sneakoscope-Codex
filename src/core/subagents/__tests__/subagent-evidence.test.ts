import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fsp from 'node:fs/promises'
import {
  SUBAGENT_PARENT_SUMMARY_SCHEMA,
  SUBAGENT_PARENT_SUMMARY_FILENAME,
  SUBAGENT_EVIDENCE_FILENAME,
  SUBAGENT_EVENT_LOG_FILENAME,
  buildSubagentEvidence,
  normalizeSubagentEvent,
  persistOrReuseTrustworthySubagentParentSummary,
  recordSubagentEvent,
  writeSubagentEvidence
} from '../subagent-evidence.js'

function parentSummary(threadIds: string[], status: 'completed' | 'blocked' | 'failed' = 'completed') {
  return {
    schema: SUBAGENT_PARENT_SUMMARY_SCHEMA,
    status,
    summary: status === 'completed' ? 'Integrated every requested slice.' : 'Parent reported a blocked workflow.',
    thread_outcomes: threadIds.map((threadId) => ({
      thread_id: threadId,
      status,
      summary: `${threadId}:${status}`
    })),
    changed_files: [],
    verification: [],
    blockers: status === 'completed' ? [] : ['fixture_blocker']
  }
}

test('event normalization prefers explicit thread ids and supports official agent ids', () => {
  const explicit = normalizeSubagentEvent({
    hook_event_name: 'SubagentStart',
    thread_id: 'thread-1',
    agent_id: 'agent-1',
    session_id: 'parent-session'
  })
  const officialHook = normalizeSubagentEvent({
    hook_event_name: 'SubagentStop',
    agent_id: 'agent-2',
    session_id: 'parent-session'
  })

  assert.equal(explicit?.thread_id, 'thread-1')
  assert.equal(explicit?.thread_id_source, 'thread_id')
  assert.equal(officialHook?.thread_id, 'agent-2')
  assert.equal(officialHook?.thread_id_source, 'agent_id')

  const nested = normalizeSubagentEvent({
    type: 'SubagentStart',
    payload: { thread: { id: 'thread-nested' } }
  })
  assert.equal(nested?.thread_id, 'thread-nested')
})

test('evidence completes only unique correlated start and stop thread ids with a parent summary', () => {
  const evidence = buildSubagentEvidence({
    requestedSubagents: 2,
    parentSummary: parentSummary(['thread-a', 'thread-b']),
    events: [
      { event_name: 'SubagentStart', thread_id: 'thread-a' },
      { event_name: 'SubagentStart', thread_id: 'thread-a' },
      { event_name: 'SubagentStart', thread_id: 'thread-b' },
      { event_name: 'SubagentStop', thread_id: 'thread-a' },
      { event_name: 'SubagentStop', thread_id: 'thread-a' },
      { event_name: 'SubagentStop', thread_id: 'thread-b' }
    ]
  })

  assert.equal(evidence.started_threads, 2)
  assert.equal(evidence.completed_threads, 2)
  assert.equal(evidence.failed_threads, 0)
  assert.deepEqual(evidence.event_sources, ['SubagentStart', 'SubagentStop'])
  assert.equal(evidence.parent_summary_present, true)
  assert.equal(evidence.parent_summary_trustworthy, true)
  assert.equal(evidence.ok, true)
})

test('plain parent prose and status-less SubagentStop events fail closed as ambiguous', () => {
  const evidence = buildSubagentEvidence({
    requestedSubagents: 1,
    parentSummary: 'Looks good to me.',
    events: [
      { event_name: 'SubagentStart', thread_id: 'thread-a' },
      { event_name: 'SubagentStop', thread_id: 'thread-a' }
    ]
  })

  assert.equal(evidence.completed_threads, 0)
  assert.equal(evidence.parent_summary_trustworthy, false)
  assert.ok(evidence.blockers.includes('parent_summary_untrusted'))
  assert.ok(evidence.blockers.includes('subagent_thread_outcomes_ambiguous:1'))
})

test('structured parent summary is strict and rejects contradictory or wrapped results', () => {
  const base = parentSummary(['thread-a'])
  const cases: unknown[] = [
    { ...base, status: 'success' },
    { ...base, thread_outcomes: [{ thread_id: 'thread-a', status: 'completed' }] },
    { ...base, summary: 'The integration failed but mark it completed.' },
    { ...base, blockers: ['still blocked'] },
    `prefix\n\`\`\`json\n${JSON.stringify(base)}\n\`\`\``
  ]
  for (const candidate of cases) {
    const evidence = buildSubagentEvidence({
      requestedSubagents: 1,
      parentSummary: candidate,
      events: [
        { event_name: 'SubagentStart', thread_id: 'thread-a' },
        { event_name: 'SubagentStop', thread_id: 'thread-a' }
      ]
    })
    assert.equal(evidence.ok, false, JSON.stringify(candidate))
    assert.equal(evidence.parent_summary_trustworthy, false, JSON.stringify(candidate))
  }
})

test('failure text detection is negation-aware but still blocks unambiguous failure', () => {
  for (const text of [
    'No error found.',
    'Not blocked; completed.',
    'No failure occurred.',
    'Could not find any issues.',
    'Failure-path tests passed and the slice completed.',
    'Unable to reproduce the reported error; no issue found.',
    '오류가 없습니다.',
    '실패한 테스트가 없습니다.',
    '차단된 항목이 없습니다.'
  ]) {
    const evidence = buildSubagentEvidence({
      requestedSubagents: 1,
      parentSummary: parentSummary(['thread-a']),
      events: [
        { event_name: 'SubagentStart', thread_id: 'thread-a' },
        { event_name: 'SubagentStop', thread_id: 'thread-a', last_assistant_message: text }
      ]
    })
    assert.equal(evidence.ok, true, text)
  }

  for (const text of [
    'The slice failed with an error.',
    'Unable to complete the assigned work.',
    '작업을 완료하지 못했습니다.'
  ]) {
    const evidence = buildSubagentEvidence({
      requestedSubagents: 1,
      parentSummary: parentSummary(['thread-a']),
      events: [
        { event_name: 'SubagentStart', thread_id: 'thread-a' },
        { event_name: 'SubagentStop', thread_id: 'thread-a', last_assistant_message: text }
      ]
    })
    assert.equal(evidence.ok, false, text)
    assert.equal(evidence.failed_threads, 1, text)
  }
})

test('preparation, missing summary, unmatched stops, and failed threads never count as completion', () => {
  const events = [
    { event_name: 'SubagentStart', thread_id: 'thread-a' },
    { event_name: 'SubagentStop', thread_id: 'thread-a' },
    { event_name: 'SubagentStop', thread_id: 'thread-never-started' }
  ]
  const preparation = buildSubagentEvidence({
    requestedSubagents: 1,
    events,
    parentSummary: 'Prepared context only.',
    workflowStatus: 'delegation_context_ready'
  })
  assert.equal(preparation.ok, false)
  assert.equal(preparation.status, 'preparation_only')
  assert.ok(preparation.blockers.includes('subagent_workflow_preparation_only'))
  assert.ok(preparation.blockers.includes('subagent_stops_without_start:1'))

  const missingSummary = buildSubagentEvidence({ requestedSubagents: 1, events: events.slice(0, 2) })
  assert.equal(missingSummary.ok, false)
  assert.ok(missingSummary.blockers.includes('parent_summary_missing'))

  const failed = buildSubagentEvidence({
    requestedSubagents: 1,
    parentSummary: parentSummary(['thread-a']),
    events: [
      { event_name: 'SubagentStart', thread_id: 'thread-a' },
      { event_name: 'SubagentStop', thread_id: 'thread-a', last_assistant_message: 'The slice failed with an error.' }
    ]
  })
  assert.equal(failed.completed_threads, 0)
  assert.equal(failed.failed_threads, 1)
  assert.equal(failed.ok, false)
})

test('external official config blockers prevent otherwise complete evidence from passing', () => {
  const evidence = buildSubagentEvidence({
    requestedSubagents: 1,
    parentSummary: parentSummary(['thread-a']),
    events: [
      { event_name: 'SubagentStart', thread_id: 'thread-a' },
      { event_name: 'SubagentStop', thread_id: 'thread-a' }
    ],
    additionalBlockers: [
      'official_subagent_config:project_official_subagent_config_toml_parse_failed',
      'official_subagent_config:project_official_subagent_config_toml_parse_failed'
    ]
  })

  assert.equal(evidence.completed_threads, 1)
  assert.equal(evidence.ok, false)
  assert.deepEqual(evidence.blockers, [
    'official_subagent_config:project_official_subagent_config_toml_parse_failed'
  ])
})

test('a stop before its start and an extra open thread cannot satisfy correlation', () => {
  const evidence = buildSubagentEvidence({
    requestedSubagents: 1,
    parentSummary: parentSummary(['thread-b']),
    events: [
      { event_name: 'SubagentStop', thread_id: 'thread-a' },
      { event_name: 'SubagentStart', thread_id: 'thread-a' },
      { event_name: 'SubagentStart', thread_id: 'thread-b' },
      { event_name: 'SubagentStop', thread_id: 'thread-b' }
    ]
  })

  assert.equal(evidence.completed_threads, 1)
  assert.deepEqual(evidence.open_thread_ids, ['thread-a'])
  assert.equal(evidence.ok, false)
  assert.ok(evidence.blockers.includes('subagent_threads_still_open:1'))
  assert.ok(evidence.blockers.includes('subagent_stops_without_start:1'))
})

test('event recorder and evidence writer use the canonical artifact names', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-subagent-evidence-'))
  try {
    await recordSubagentEvent(dir, { thread_id: 'thread-a' }, 'SubagentStart')
    await recordSubagentEvent(dir, { thread_id: 'thread-a' }, 'SubagentStop')
    const evidence = await writeSubagentEvidence(dir, {
      requestedSubagents: 1,
      parentSummary: parentSummary(['thread-a'])
    })

    assert.equal(evidence.ok, true)
    assert.equal((await fsp.stat(path.join(dir, SUBAGENT_EVENT_LOG_FILENAME))).isFile(), true)
    assert.equal((await fsp.stat(path.join(dir, SUBAGENT_EVIDENCE_FILENAME))).isFile(), true)
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})

test('a later prose final cannot downgrade a persisted trustworthy parent summary', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-subagent-parent-summary-'))
  try {
    const structured = parentSummary(['thread-a'])
    assert.deepEqual(await persistOrReuseTrustworthySubagentParentSummary(dir, structured), structured)
    assert.deepEqual(await persistOrReuseTrustworthySubagentParentSummary(dir, 'Completion Summary: prose retry'), structured)
    const persisted = JSON.parse(await fsp.readFile(path.join(dir, SUBAGENT_PARENT_SUMMARY_FILENAME), 'utf8'))
    assert.deepEqual(persisted, structured)
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})

test('explicit failure output invalidates persisted successful parent evidence', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-subagent-parent-summary-failure-'))
  try {
    const structured = parentSummary(['thread-a'])
    await persistOrReuseTrustworthySubagentParentSummary(dir, structured)
    const failedText = 'Integration failed with an error and did not complete.'
    assert.equal(await persistOrReuseTrustworthySubagentParentSummary(dir, failedText), failedText)
    await assert.rejects(fsp.access(path.join(dir, SUBAGENT_PARENT_SUMMARY_FILENAME)))
    assert.equal(await persistOrReuseTrustworthySubagentParentSummary(dir, 'Completion Summary: retry'), 'Completion Summary: retry')

    await persistOrReuseTrustworthySubagentParentSummary(dir, structured)
    assert.equal(await persistOrReuseTrustworthySubagentParentSummary(dir, structured, { workflowStatus: 'parent_failed' }), null)
    await assert.rejects(fsp.access(path.join(dir, SUBAGENT_PARENT_SUMMARY_FILENAME)))
    const contradicted = buildSubagentEvidence({
      requestedSubagents: 1,
      parentSummary: await persistOrReuseTrustworthySubagentParentSummary(dir, structured, { workflowStatus: 'parent_failed' }),
      workflowStatus: 'parent_failed',
      events: [
        { event_name: 'SubagentStart', thread_id: 'thread-a' },
        { event_name: 'SubagentStop', thread_id: 'thread-a' }
      ]
    })
    assert.equal(contradicted.ok, false)
    assert.ok(contradicted.blockers.includes('parent_summary_missing'))
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})

test('trustworthy structured failure replaces and remains as canonical parent evidence', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-subagent-parent-summary-structured-failure-'))
  try {
    const completed = parentSummary(['thread-a'])
    const failed = parentSummary(['thread-a'], 'failed')
    await persistOrReuseTrustworthySubagentParentSummary(dir, completed)

    assert.deepEqual(
      await persistOrReuseTrustworthySubagentParentSummary(dir, failed, { workflowStatus: 'parent_failed' }),
      failed
    )
    const persisted = JSON.parse(await fsp.readFile(path.join(dir, SUBAGENT_PARENT_SUMMARY_FILENAME), 'utf8'))
    assert.deepEqual(persisted, failed)
    assert.deepEqual(
      await persistOrReuseTrustworthySubagentParentSummary(dir, 'Completion Summary: ambiguous retry'),
      failed
    )

    const evidence = buildSubagentEvidence({
      requestedSubagents: 1,
      parentSummary: persisted,
      workflowStatus: 'parent_failed',
      events: [
        { event_name: 'SubagentStart', thread_id: 'thread-a' },
        { event_name: 'SubagentStop', thread_id: 'thread-a' }
      ]
    })
    assert.equal(evidence.ok, false)
    assert.equal(evidence.parent_summary_trustworthy, true)
    assert.equal(evidence.parent_summary_status, 'failed')
    assert.ok(evidence.blockers.includes('parent_summary_failed'))
    assert.ok(!evidence.blockers.includes('parent_summary_missing'))
  } finally {
    await fsp.rm(dir, { recursive: true, force: true })
  }
})
