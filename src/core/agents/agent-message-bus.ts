import path from 'node:path'
import { appendJsonl } from '../fsx.js'
import { appendAgentLedgerEvent } from './agent-central-ledger.js'

export async function appendAgentMessage(root: string, message: { from: string; session_id: string; to?: string; body: string; type?: string }) {
  const entry = {
    schema: 'sks.agent-message.v1',
    from: message.from,
    session_id: message.session_id,
    to: message.to || 'orchestrator',
    type: message.type || 'note',
    body: message.body
  }
  await appendJsonl(path.join(root, 'agent-messages.jsonl'), entry)
  await appendAgentLedgerEvent(root, { agent_id: message.from, session_id: message.session_id, event_type: 'message_appended', payload: { to: entry.to, type: entry.type } })
  return entry
}

