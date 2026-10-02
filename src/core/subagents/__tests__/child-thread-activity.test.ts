import test from 'node:test'
import assert from 'node:assert/strict'
import { childResumeDetected, childThreadTimeline, latestThreadTurnId } from '../child-thread-activity.js'
import { normalizeSubagentEvent } from '../subagent-evidence.js'

type Row = { name: 'SubagentStart' | 'SubagentStop' | 'SubagentResume'; thread: string; turn?: string | null }

function events(rows: Row[]) {
  return rows.map((row) => ({
    event_name: row.name,
    thread_id: row.thread,
    turn_id: row.turn === undefined ? `turn-of-${row.thread}` : row.turn
  }))
}

test('a thread is running from its newest Start or resume until a later Stop', () => {
  const log = events([
    { name: 'SubagentStart', thread: 'a' },
    { name: 'SubagentStart', thread: 'b' },
    { name: 'SubagentStop', thread: 'a' },
    { name: 'SubagentStop', thread: 'b' }
  ])
  assert.deepEqual(childThreadTimeline(log), { started: ['a', 'b'], open: [], peakOpen: 2 })

  // Follow-up turn on a settled child: no second Start, only a resume.
  const resumed = childThreadTimeline([...log, ...events([{ name: 'SubagentResume', thread: 'a', turn: 't2' }])])
  assert.deepEqual(resumed.open, ['a'])
  assert.equal(resumed.started.length, 2)

  const settledAgain = childThreadTimeline([
    ...log,
    ...events([{ name: 'SubagentResume', thread: 'a', turn: 't2' }, { name: 'SubagentStop', thread: 'a', turn: 't2' }])
  ])
  assert.deepEqual(settledAgain.open, [])
})

test('a resume only counts for a thread that has a Start, and peak open follows resumes', () => {
  assert.deepEqual(childThreadTimeline(events([{ name: 'SubagentResume', thread: 'ghost' }])), { started: [], open: [], peakOpen: 0 })

  const peak = childThreadTimeline(events([
    { name: 'SubagentStart', thread: 'a' },
    { name: 'SubagentStop', thread: 'a' },
    { name: 'SubagentStart', thread: 'b' },
    { name: 'SubagentResume', thread: 'a', turn: 't2' }
  ]))
  assert.equal(peak.peakOpen, 2)
  assert.deepEqual(peak.open, ['a', 'b'])
})

test('a hook turn that differs from the newest recorded turn of a started thread is a resume', () => {
  const log = events([
    { name: 'SubagentStart', thread: 'a', turn: 't1' },
    { name: 'SubagentStop', thread: 'a', turn: 't1' },
    { name: 'SubagentStart', thread: 'b', turn: 'tb' }
  ])
  assert.equal(childResumeDetected(log, 'a', 't1'), false)
  assert.equal(childResumeDetected(log, 'a', 't2'), true)
  assert.equal(childResumeDetected(log, 'never-started', 't2'), false)
  assert.equal(childResumeDetected(log, 'a', ''), false)

  // Once the resume is recorded the same turn is no longer new, and the Stop of
  // that turn keeps it that way.
  const withResume = [...log, ...events([{ name: 'SubagentResume', thread: 'a', turn: 't2' }])]
  assert.equal(childResumeDetected(withResume, 'a', 't2'), false)
  assert.equal(childResumeDetected(withResume, 'a', 't3'), true)
  assert.equal(latestThreadTurnId(withResume, 'a'), 't2')

  // Legacy Stop rows carry no turn id; the newest recorded turn is still used.
  const legacyStop = events([
    { name: 'SubagentStart', thread: 'c', turn: 't1' },
    { name: 'SubagentStop', thread: 'c', turn: null }
  ])
  assert.equal(childResumeDetected(legacyStop, 'c', 't1'), false)
  // No recorded turn at all: nothing to compare against.
  assert.equal(childResumeDetected(events([{ name: 'SubagentStart', thread: 'd', turn: null }]), 'd', 't9'), false)
})

test('a resume row survives normalization and is not mistaken for a Stop', () => {
  const resume = normalizeSubagentEvent({
    hook_event_name: 'PreToolUse',
    session_id: '019fa1ac-d303-77f0-9c3c-b3536dba9fd8',
    turn_id: '019fa294-1599-7d42-a854-c3afe6d6cc60',
    agent_id: '019fa282-62f0-7503-8eb3-c238831ee226',
    tool_use_id: 'call_abc',
    workflow_run_id: 'naruto-run'
  }, 'SubagentResume')
  assert.equal(resume?.event_name, 'SubagentResume')
  assert.equal(resume?.outcome, 'started')
  assert.equal(resume?.thread_id, '019fa282-62f0-7503-8eb3-c238831ee226')
  assert.equal(resume?.run_id, 'naruto-run')

  const reread = normalizeSubagentEvent(resume)
  assert.equal(reread?.event_name, 'SubagentResume')
  assert.equal(reread?.outcome, 'started')
})
