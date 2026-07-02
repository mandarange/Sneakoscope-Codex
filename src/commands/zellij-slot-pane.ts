import { renderZellijSlotPaneFromArtifacts, renderZellijSlotPaneStatusFromArtifacts, resolveZellijSlotPaneExit } from '../core/zellij/zellij-slot-pane-renderer.js'

export async function run(_command: string = 'zellij-slot-pane', args: string[] = []) {
  const artifactDir = readOption(args, '--artifact-dir', process.cwd()) || process.cwd()
  const artifactRoot = readOption(args, '--artifact-root', artifactDir) || artifactDir
  const missionId = readOption(args, '--mission', '') || ''
  const slotId = readOption(args, '--slot', 'slot-001') || 'slot-001'
  const generationIndex = Number(readOption(args, '--generation', '1') || 1)
  const backend = readOption(args, '--backend', null)
  const role = readOption(args, '--role', null)
  const envDefaults = {
    provider: process.env.SKS_SLOT_PROVIDER || null,
    model: process.env.SKS_SLOT_MODEL || null,
    serviceTier: process.env.SKS_SLOT_TIER || null,
    reasoningEffort: process.env.SKS_SLOT_REASONING || null,
    currentTask: process.env.SKS_SLOT_TASK || null,
    role: process.env.SKS_SLOT_ROLE || role
  }
  const mode = readOption(args, '--mode', 'compact-slots') as any
  const watch = hasFlag(args, '--watch')
  const json = hasFlag(args, '--json')
  const intervalMs = Math.max(250, Number(readOption(args, '--interval-ms', '1000') || 1000))
  if (json) {
    const status = await renderZellijSlotPaneStatusFromArtifacts({ artifactDir, artifactRoot, missionId, slotId, generationIndex })
    console.log(JSON.stringify(status, null, 2))
    return
  }
  let staleTicks = 0
  for (;;) {
    let text = ''
    let heartbeatAgeMs: number | null = null
    try {
      text = await renderZellijSlotPaneFromArtifacts({
        artifactDir,
        artifactRoot,
        missionId,
        slotId,
        generationIndex,
        backend,
        role: envDefaults.role,
        provider: envDefaults.provider,
        model: envDefaults.model,
        serviceTier: envDefaults.serviceTier,
        reasoningEffort: envDefaults.reasoningEffort,
        currentTask: envDefaults.currentTask,
        mode
      })
      const status = await renderZellijSlotPaneStatusFromArtifacts({ artifactDir, artifactRoot, missionId, slotId, generationIndex }).catch(() => null)
      heartbeatAgeMs = Number.isFinite(Number(status?.telemetry_age_ms)) ? Number(status?.telemetry_age_ms) : null
    } catch (err: any) {
      text = `render error: ${err?.message || String(err)}`
    }
    process.stdout.write(redrawFrame(text))
    if (!watch) break
    // Root-cause-3 fix: exit the pane once the worker has reached a terminal state and written its
    // result, so the pane closes (or shows the final exited frame) instead of looping forever and
    // perpetually re-reporting telemetry staleness.
    const shouldExit = await resolveZellijSlotPaneExit({ artifactDir, artifactRoot, missionId, slotId, generationIndex }).catch(() => false)
    if (shouldExit) {
      await new Promise((resolve) => setTimeout(resolve, 5000))
      const finalText = await renderZellijSlotPaneFromArtifacts({ artifactDir, artifactRoot, missionId, slotId, generationIndex, backend, role: envDefaults.role, provider: envDefaults.provider, model: envDefaults.model, serviceTier: envDefaults.serviceTier, reasoningEffort: envDefaults.reasoningEffort, currentTask: envDefaults.currentTask, mode })
      process.stdout.write(redrawFrame(finalText))
      return
    }
    staleTicks = heartbeatAgeMs != null && heartbeatAgeMs > 5 * 60 * 1000 ? staleTicks + 1 : 0
    if (staleTicks >= 5) {
      process.stdout.write(redrawFrame(`${text}\n⏱ worker heartbeat lost >5m - pane closing (sks pipeline status 로 확인)`))
      return
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

function readOption(args: string[], name: string, fallback: string): string
function readOption(args: string[], name: string, fallback: string | null): string | null
function readOption(args: string[], name: string, fallback: string | null): string | null {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] ? String(args[index + 1]) : fallback
}

// Redraw in place with cursor-home + clear-to-end instead of `\x1Bc` (RIS).
// RIS performs a full terminal reset every tick, which wipes the Zellij pane's
// scrollback and resets scroll position/modes — the cause of intermittent
// "scrolling stops working" while a watch pane is refreshing.
function redrawFrame(text: string) {
  return '\x1b[H' + text + '\n\x1b[0J'
}

function hasFlag(args: string[], flag: string) {
  return args.includes(flag)
}
