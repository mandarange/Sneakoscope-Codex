import { nowIso } from '../fsx.js'

export interface CodexTranslatedEvent {
  schema: 'sks.codex-sdk-translated-event.v1'
  ts: string
  sdk_event_type: string
  lane_status: 'running' | 'blocked' | 'completed'
  current_tool: string | null
  current_file: string | null
  message_tail: string | null
  blocker: string | null
}

export function translateCodexSdkEvent(event: any): CodexTranslatedEvent {
  const type = String(event?.type || 'unknown')
  const item = event?.item || {}
  const isTool = item.type === 'command_execution' || item.type === 'mcp_tool_call'
  const fileChange = item.type === 'file_change' && Array.isArray(item.changes) ? item.changes[0] : null
  return {
    schema: 'sks.codex-sdk-translated-event.v1',
    ts: nowIso(),
    sdk_event_type: type,
    lane_status: type === 'turn.failed' || type === 'error' ? 'blocked' : type === 'turn.completed' ? 'completed' : 'running',
    current_tool: isTool ? String(item.command || item.tool || item.type || '') : null,
    current_file: fileChange?.path ? String(fileChange.path) : null,
    message_tail: item.type === 'agent_message' ? String(item.text || '').slice(-500) : null,
    blocker: type === 'turn.failed' ? String(event?.error?.message || 'turn_failed') : type === 'error' ? String(event?.message || 'sdk_stream_error') : null
  }
}

export function translateCodexSdkEvents(events: any[]) {
  return events.map(translateCodexSdkEvent)
}
