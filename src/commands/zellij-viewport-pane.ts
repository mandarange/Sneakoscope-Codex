import path from 'node:path'
import { flag, readOption } from '../cli/args.js'
import { projectRoot, readJson } from '../core/fsx.js'
import { readZellijSlotTelemetrySnapshot } from '../core/zellij/zellij-slot-telemetry.js'
import { bindViewports, type ViewportPin } from '../core/zellij/zellij-viewport-binder.js'
import { renderZellijSlotPaneFromArtifacts } from '../core/zellij/zellij-slot-pane-renderer.js'
import { ANSI_CODES, paint, resolveZellijTheme } from '../core/zellij/zellij-theme.js'

let previousBindings: Array<string | null> = []

export async function run(_cmd: string = 'zellij-viewport-pane', args: string[] = []) {
  const mission = String(readOption(args, '--mission', 'latest') || 'latest')
  const index = Math.max(1, Number(readOption(args, '--index', '1')) || 1)
  const of = Math.max(index, Number(readOption(args, '--of', '4')) || 4)
  const intervalMs = Math.max(500, Number(process.env.SKS_ZELLIJ_REFRESH_MS || 1000))
  const root = await projectRoot()
  previousBindings = Array.from({ length: of }, () => null)
  const once = !flag(args, '--watch')
  for (;;) {
    const frame = await renderViewportFrame(root, mission, index, of).catch((err: any) => `viewport render error: ${err?.message || String(err)}`)
    process.stdout.write(`\x1b[H${frame}\n\x1b[0J`)
    if (once) return
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

async function renderViewportFrame(root: string, mission: string, index: number, of: number): Promise<string> {
  const theme = resolveZellijTheme()
  const snapshot = await readZellijSlotTelemetrySnapshot(root, mission).catch(() => null)
  const missionId = snapshot?.mission_id || mission
  const pins = await readJson<{ pins: ViewportPin[] }>(pinsPath(root, missionId), { pins: [] })
  const bindings = bindViewports({
    snapshot,
    pins: pins.pins || [],
    previous: previousBindings,
    viewportCount: of
  })
  previousBindings = bindings.map((binding) => binding.slotKey)
  const mine = bindings[index - 1] || { slotKey: null, reason: 'idle' as const }
  const badge = mine.reason === 'pinned' ? 'pinned' : mine.reason === 'kept' ? 'auto' : mine.reason
  const header = paint(theme, ANSI_CODES.dim, `viewport ${index}/${of} | ${mine.slotKey ?? '-'} (${badge})`)
  if (!mine.slotKey) return `${header}\n${paint(theme, ANSI_CODES.dim, `idle - no active worker. Pin: sks zellij pin <slot> --viewport ${index}`)}`
  const [slotId, rawGen] = mine.slotKey.split(':g')
  const generationIndex = Math.max(1, Number(rawGen || 1) || 1)
  const detail = await renderZellijSlotPaneFromArtifacts({
    artifactRoot: root,
    missionId,
    artifactDir: path.join(root, '.sneakoscope', 'missions', missionId, 'agents', 'sessions', slotId || mine.slotKey, `gen-${generationIndex}`, 'worker'),
    slotId: slotId || mine.slotKey,
    generationIndex
  })
  return `${header}\n${detail}`
}

function pinsPath(root: string, missionId: string): string {
  return path.join(root, '.sneakoscope', 'missions', missionId, 'zellij', 'viewport-pins.json')
}
