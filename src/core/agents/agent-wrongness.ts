import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'

const WRONGNESS_MAP = [
  ['recursion_attempt', /^recursion:/],
  ['lease_conflict', /(?:write_overlap|protected_write|lease_conflict)/],
  ['session_not_closed', /^session_open:/],
  ['terminal_missing', /^terminal_missing:/],
  ['terminal_not_closed', /^terminal_not_closed:/],
  ['scheduler_starvation', /scheduler_pending_queue_without_active_sessions|scheduler_backfill_count_below_expected/],
  ['missing_follow_up_schema', /follow_up_work_item|follow_up_work_items|schema_invalid:.*follow_up/],
  ['session_generation_missing', /session_generation_open|terminal_close_report_missing|source_intelligence_missing_for_generation|goal_mode_missing_for_generation/],
  ['schema_invalid_output', /^schema_invalid:/],
  ['official_subagent_proof_missing', /official_subagent_(?:route_gate|evidence(?:_required)?|workflow|parent_summary|run_id|plan).*missing/],
  ['super_search_provider_independent_proof_missing', /super_search_provider_independent_proof_missing/],
  ['codex_web_search_missing', /codex_web_search_missing/],
  ['context7_missing', /context7_missing|docs_context_missing/],
  ['stale_heartbeat', /stale_heartbeat/]
] as const

export async function writeAgentWrongnessRecords(root: string, blockers: string[] = []) {
  const records = blockers.flatMap((blocker) =>
    WRONGNESS_MAP
      .filter(([, re]) => re.test(blocker))
      .map(([kind]) => ({
        schema: 'sks.agent-wrongness-record.v1',
        kind,
        blocker,
        created_at: nowIso(),
        status: 'active'
      }))
  )
  const report = {
    schema: 'sks.agent-wrongness-records.v1',
    generated_at: nowIso(),
    records
  }
  await writeJsonAtomic(path.join(root, 'agent-wrongness-records.json'), report)
  return report
}
