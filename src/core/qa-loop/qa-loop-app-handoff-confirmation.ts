import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'

export interface QaLoopAppHandoffConfirmation {
  schema: 'sks.qa-loop-app-handoff-confirmation.v1'
  mission_id: string
  confirmed_at: string
  verdict: 'pass' | 'fail'
  notes: string
  operator: string | null
  related_handoff_artifact: string
}

export async function confirmQaLoopAppHandoff(root: string, input: {
  missionId: string
  verdict: 'pass' | 'fail'
  notes?: string | null
  operator?: string | null
}): Promise<{ confirmation: QaLoopAppHandoffConfirmation; artifact_path: string; gate: any }> {
  const missionDir = path.join(root, '.sneakoscope', 'missions', input.missionId)
  const qaLoopDir = path.join(missionDir, 'qa-loop')
  const handoffArtifact = path.join(qaLoopDir, 'app-handoff.json')
  const confirmationArtifact = path.join(qaLoopDir, 'app-handoff-confirmation.json')
  const handoff = await readJson(handoffArtifact, null)
  if (handoff?.schema !== 'sks.codex-app-handoff-result.v1') {
    throw new Error(`Cannot confirm Desktop app handoff before app-handoff.json exists for mission ${input.missionId}`)
  }
  if (input.verdict === 'pass' && handoff.status === 'blocked_for_desktop_review') {
    throw new Error(`Cannot pass-confirm blocked Desktop app handoff for mission ${input.missionId}`)
  }
  const confirmation: QaLoopAppHandoffConfirmation = {
    schema: 'sks.qa-loop-app-handoff-confirmation.v1',
    mission_id: input.missionId,
    confirmed_at: nowIso(),
    verdict: input.verdict,
    notes: String(input.notes || ''),
    operator: input.operator || process.env.USER || null,
    related_handoff_artifact: path.relative(missionDir, handoffArtifact).split(path.sep).join('/')
  }
  await writeJsonAtomic(confirmationArtifact, confirmation)
  const gatePath = path.join(missionDir, 'qa-gate.json')
  const previousGate = await readJson(gatePath, {})
  const previousBlockers = Array.isArray(previousGate.blockers) ? previousGate.blockers : []
  const failedBlocker = 'desktop_app_handoff_failed'
  const blockers = input.verdict === 'pass'
    ? previousBlockers.filter((blocker: unknown) => blocker !== failedBlocker && blocker !== 'desktop_app_handoff_confirmation_missing')
    : Array.from(new Set([...previousBlockers, failedBlocker]))
  const gate = {
    ...previousGate,
    desktop_app_handoff_required: previousGate.desktop_app_handoff_required === true,
    desktop_app_handoff_status: input.verdict === 'pass' ? 'completed' : previousGate.desktop_app_handoff_status || 'pending',
    desktop_app_handoff_confirmed: input.verdict === 'pass',
    desktop_app_handoff_verdict: input.verdict,
    desktop_app_handoff_confirmation_artifact: path.relative(missionDir, confirmationArtifact).split(path.sep).join('/'),
    desktop_app_handoff_confirmation_notes: confirmation.notes,
    blockers,
    notes: Array.from(new Set([
      ...(Array.isArray(previousGate.notes) ? previousGate.notes : []),
      input.verdict === 'pass'
        ? 'Codex Desktop /app review was explicitly confirmed by operator artifact.'
        : 'Codex Desktop /app review failed and remains a QA blocker.'
    ]))
  }
  await writeJsonAtomic(gatePath, gate)
  return { confirmation, artifact_path: confirmationArtifact, gate }
}
