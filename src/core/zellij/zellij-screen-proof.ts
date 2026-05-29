import path from 'node:path'
import { nowIso, readJson, readText, writeJsonAtomic } from '../fsx.js'

export const ZELLIJ_SCREEN_PROOF_SCHEMA = 'sks.zellij-screen-proof.v1'

export async function writeZellijScreenProof(root: string, opts: { missionId?: string; require?: boolean; ledgerRoot?: string } = {}) {
  const proofRoot = path.resolve(opts.ledgerRoot || (opts.missionId ? path.join(root, '.sneakoscope', 'missions', opts.missionId) : path.join(root, '.sneakoscope', 'reports')))
  const paneProof = await readJson<any>(path.join(proofRoot, 'zellij-pane-proof.json'), null)
  const heartbeat = await readText(path.join(proofRoot, 'zellij-lane-renderer-heartbeat.jsonl'), '')
  const session = await readJson<any>(path.join(proofRoot, 'zellij-session.json'), null)
  const hasHeartbeat = String(heartbeat || '').trim().length > 0
  const blockers = [
    ...(opts.require === true && paneProof?.ok !== true ? ['zellij_pane_proof_missing_or_failed'] : []),
    ...(opts.require === true && !hasHeartbeat ? ['zellij_lane_renderer_heartbeat_missing'] : [])
  ]
  const report = {
    schema: ZELLIJ_SCREEN_PROOF_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    mission_id: opts.missionId || null,
    proof_root: proofRoot,
    session_present: Boolean(session),
    pane_proof_ok: paneProof?.ok === true,
    lane_renderer_heartbeat_present: hasHeartbeat,
    stdout_stderr_overlap_policy: 'lane renderer writes frames to stdout and reserves stderr for errors',
    blockers,
    warnings: [
      ...(!session ? ['zellij_session_artifact_missing'] : []),
      ...(!hasHeartbeat && opts.require !== true ? ['zellij_lane_renderer_heartbeat_not_required'] : [])
    ]
  }
  await writeJsonAtomic(path.join(proofRoot, 'zellij-screen-proof.json'), report)
  return report
}
