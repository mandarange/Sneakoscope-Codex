import path from 'node:path'
import { ensureDir, nowIso, readJson, readText, writeJsonAtomic, writeTextAtomic } from '../fsx.js'
import { checkZellijCapability } from './zellij-capability.js'
import { runZellij } from './zellij-command.js'
import { ZELLIJ_SCREEN_SCRAPEABLE_SECTIONS } from './zellij-lane-renderer.js'

export const ZELLIJ_SCREEN_PROOF_SCHEMA = 'sks.zellij-screen-proof.v1'
// Canonical scrapeable subset (a strict subset of ZELLIJ_LANE_SECTIONS).
const REQUIRED_LANE_TEXT = ZELLIJ_SCREEN_SCRAPEABLE_SECTIONS

export const ZELLIJ_HEARTBEAT_TIMEOUT_BLOCKER = 'zellij_lane_heartbeat_timeout'

export interface LaneHeartbeatResult {
  ok: boolean
  heartbeat_present: boolean
  heartbeat_path: string
  waited_ms: number
  timeout_ms: number
  blocker: string | null
}

/**
 * Poll for the lane renderer heartbeat file and return a decisive result. A
 * timeout is turned into the `zellij_lane_heartbeat_timeout` blocker so callers
 * (real-session launch gate) can fail directly instead of waiting silently.
 * Pure enough to be exercised hermetically without a real Zellij session.
 */
export async function waitForLaneHeartbeat(
  file: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<LaneHeartbeatResult> {
  const timeoutMs = Math.max(0, Number(opts.timeoutMs ?? 5000))
  const intervalMs = Math.max(25, Number(opts.intervalMs ?? 250))
  const startedAt = Date.now()
  const deadline = startedAt + timeoutMs
  let present = false
  for (;;) {
    const text = await readText(file, '')
    if (String(text || '').trim()) {
      present = true
      break
    }
    if (Date.now() >= deadline) break
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return {
    ok: present,
    heartbeat_present: present,
    heartbeat_path: file,
    waited_ms: Date.now() - startedAt,
    timeout_ms: timeoutMs,
    blocker: present ? null : ZELLIJ_HEARTBEAT_TIMEOUT_BLOCKER
  }
}

export async function writeZellijScreenProof(root: string, opts: { missionId?: string; require?: boolean; ledgerRoot?: string; mainOnly?: boolean } = {}) {
  const proofRoot = path.resolve(opts.ledgerRoot || (opts.missionId ? path.join(root, '.sneakoscope', 'missions', opts.missionId) : path.join(root, '.sneakoscope', 'reports')))
  const paneProof = await readJson<any>(path.join(proofRoot, 'zellij-pane-proof.json'), null)
  const heartbeat = await readFirstText([
    path.join(proofRoot, 'zellij-lane-renderer-heartbeat.jsonl'),
    path.join(proofRoot, 'agents', 'zellij-lane-renderer-heartbeat.jsonl')
  ])
  const session = await readJson<any>(path.join(proofRoot, 'zellij-session.json'), null)
  const hasHeartbeat = String(heartbeat || '').trim().length > 0
  const capability = await checkZellijCapability({ root, require: opts.require === true, writeReport: true })
  const lanePanes = Array.isArray(paneProof?.lane_panes) ? paneProof.lane_panes : []
  const dumpDir = path.join(proofRoot, 'zellij-screen-dumps')
  await ensureDir(dumpDir)
  const dumps = []
  if (capability.status === 'ok') {
    for (const pane of lanePanes) {
      const paneId = String(pane?.pane_id || '')
      if (!paneId) continue
      const safePaneId = paneId.replace(/[^A-Za-z0-9_.:-]+/g, '_')
      const rawPath = path.join(dumpDir, `lane-${safePaneId}.ansi.txt`)
      const humanPath = path.join(dumpDir, `lane-${safePaneId}.txt`)
      const command = session?.session_name
        ? ['--session', String(session.session_name), 'action', 'dump-screen', '--path', rawPath, '--pane-id', paneId, '--full']
        : ['action', 'dump-screen', '--path', rawPath, '--pane-id', paneId, '--full']
      const result = await runZellij(command, { cwd: root, timeoutMs: 5000, optional: opts.require !== true })
      const raw = await readText(rawPath, result.stdout_tail || '')
      const human = stripAnsi(String(raw || result.stdout_tail || ''))
      await writeTextAtomic(humanPath, human)
      const missingText = REQUIRED_LANE_TEXT.filter((label) => !human.includes(label))
      dumps.push({
        pane_id: paneId,
        command: ['zellij', ...command],
        raw_path: rawPath,
        human_path: humanPath,
        result,
        required_text_present: missingText.length === 0,
        missing_text: missingText
      })
    }
  }
  const blockers = [
    ...(opts.require === true && paneProof?.ok !== true ? ['zellij_pane_proof_missing_or_failed'] : []),
    ...(opts.require === true && opts.mainOnly !== true && !hasHeartbeat ? ['zellij_lane_renderer_heartbeat_missing'] : []),
    ...capability.blockers,
    ...(opts.require === true && opts.mainOnly !== true && lanePanes.length === 0 ? ['zellij_screen_lane_panes_missing'] : []),
    ...(opts.require === true && opts.mainOnly !== true && capability.status === 'ok' && dumps.length === 0 ? ['zellij_screen_dump_missing'] : []),
    ...(opts.require === true ? dumps.flatMap((dump) => dump.result.ok ? [] : dump.result.blockers.map((blocker: string) => `zellij_screen_${blocker}`)) : []),
    ...(opts.require === true ? dumps.flatMap((dump) => dump.missing_text.map((label: string) => `zellij_screen_missing_text:${dump.pane_id}:${label}`)) : [])
  ]
  const report = {
    schema: ZELLIJ_SCREEN_PROOF_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    main_only: opts.mainOnly === true,
    mission_id: opts.missionId || null,
    proof_root: proofRoot,
    session_present: Boolean(session),
    pane_proof_ok: paneProof?.ok === true,
    lane_renderer_heartbeat_present: hasHeartbeat,
    capability_status: capability.status,
    required_text: REQUIRED_LANE_TEXT,
    lane_pane_count: lanePanes.length,
    dumps,
    stdout_stderr_overlap_policy: 'lane renderer writes frames to stdout and reserves stderr for errors',
    blockers,
    warnings: [
      ...capability.warnings,
      ...(!session ? ['zellij_session_artifact_missing'] : []),
      ...(!hasHeartbeat && opts.require !== true ? ['zellij_lane_renderer_heartbeat_not_required'] : []),
      ...(capability.status !== 'ok' && opts.require !== true ? ['zellij_screen_dump_skipped_optional'] : [])
    ]
  }
  await writeJsonAtomic(path.join(proofRoot, 'zellij-screen-proof.json'), report)
  return report
}

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
}

async function readFirstText(files: string[]) {
  for (const file of files) {
    const text = await readText(file, '')
    if (String(text || '').trim()) return text
  }
  return ''
}
