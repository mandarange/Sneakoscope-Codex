import type { NormalizedSubagentEvent } from './subagent-evidence.js'

type ThreadEvent = Pick<NormalizedSubagentEvent, 'event_name' | 'thread_id' | 'turn_id'>

export interface ChildThreadTimeline {
  /** Threads that have a SubagentStart, in first-seen order. */
  started: string[]
  /** Threads whose newest event is a Start or a resume, i.e. no Stop after it. Sorted. */
  open: string[]
  /** Most threads open at the same moment. */
  peakOpen: number
}

/**
 * One reading of the child lifecycle log, shared by the parent gate, the active
 * workflow check and the wave lifecycle so they cannot disagree.
 *
 * Codex emits SubagentStart once per thread and SubagentStop at the end of every
 * turn, but a follow-up turn (`followup_task` / `send_message`) emits no second
 * Start. SKS records that case as a `SubagentResume`, so a thread is running from
 * its newest Start-or-resume until a later Stop. Events must be in log order and
 * already scoped to one run.
 */
export function childThreadTimeline(events: readonly ThreadEvent[]): ChildThreadTimeline {
  const started = new Set<string>()
  const open = new Set<string>()
  let peakOpen = 0
  for (const event of events) {
    const threadId = event.thread_id
    if (!threadId) continue
    if (event.event_name === 'SubagentStop') {
      open.delete(threadId)
      continue
    }
    if (event.event_name === 'SubagentStart') started.add(threadId)
    else if (!started.has(threadId)) continue
    open.add(threadId)
    peakOpen = Math.max(peakOpen, open.size)
  }
  return { started: [...started], open: [...open].sort(), peakOpen }
}

/** Newest turn id recorded for a thread by any lifecycle event. */
export function latestThreadTurnId(events: readonly ThreadEvent[], threadId: string): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index] as ThreadEvent
    if (event.thread_id === threadId && event.turn_id) return event.turn_id
  }
  return null
}

/**
 * A hook from a started child whose turn is not the newest turn on record is the
 * child running a follow-up turn. Without a recorded turn there is nothing to
 * compare, so it is not a resume.
 */
export function childResumeDetected(events: readonly ThreadEvent[], threadId: string, turnId: string): boolean {
  if (!threadId || !turnId) return false
  if (!events.some((event) => event.event_name === 'SubagentStart' && event.thread_id === threadId)) return false
  const latest = latestThreadTurnId(events, threadId)
  return latest !== null && latest !== turnId
}
