import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fsp from 'node:fs/promises'
import {
  SUBAGENT_PARENT_SUMMARY_SCHEMA,
  SUBAGENT_EVIDENCE_FILENAME,
  SUBAGENT_EVENT_LOG_FILENAME,
  buildSubagentEvidence,
  normalizeSubagentEvent,
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
