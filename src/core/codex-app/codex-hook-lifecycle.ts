// @ts-nocheck
import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import { readCodexHookActualState } from '../codex-hooks/codex-hook-actual-discovery.js'
import { installManagedCodexHooks } from '../codex-hooks/codex-hook-managed-install.js'

export async function buildCodexHookLifecycle(input: { root: string; apply?: boolean } = {}): Promise<any> {
  const root = path.resolve(input.root || process.cwd())
  const install = input.apply === true
    ? await installManagedCodexHooks(root).catch((err: any) => ({ ok: false, blockers: [err?.message || String(err)] }))
    : null
  const actual = await readCodexHookActualState(root).catch((err: any) => ({ ok: false, entries: [], blockers: [err?.message || String(err)] }))
  const events = {
    UserPromptSubmit: ['route_classifier', 'goal_to_loop_compiler', 'permission_profile_badge'],
    PreToolUse: ['requested_scope_guard', 'mad_db_priority_resolver', 'side_effect_zero_gate'],
    PostToolUse: ['evidence_ledger', 'mutation_ledger', 'side_effect_scanner', 'context7_native_session_updates'],
    Stop: ['continuation_enforcer', 'final_proof_check', 'loop_resume_hint'],
    Notification: ['operator_status', 'zellij_anchor', 'codex_app_status']
  }
  const installedEvents = new Set((actual.entries || []).map((entry: any) => entry.event))
  const report = {
    schema: 'sks.codex-hook-lifecycle.v1',
    generated_at: nowIso(),
    ok: actual.ok !== false,
    apply: input.apply === true,
    approval_state: 'unknown',
    approval_state_detectable: false,
    lifecycle: Object.fromEntries(Object.entries(events).map(([event, actions]) => [event, {
      actions,
      installed: installedEvents.has(event),
      approval_state: 'unknown'
    }])),
    actual_state: actual,
    install,
    blockers: actual.blockers || [],
    warnings: ['hook_approval_state_unknown']
  }
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'codex-hook-lifecycle.json'), report).catch(() => undefined)
  return report
}
