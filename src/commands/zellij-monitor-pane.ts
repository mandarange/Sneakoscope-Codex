import { readZellijSlotTelemetrySnapshot } from '../core/zellij/zellij-slot-telemetry.js'
import { renderZellijMonitor } from '../core/zellij/zellij-monitor-renderer.js'
import { projectRoot } from '../core/fsx.js'

export async function run(_cmd: string = 'zellij-monitor-pane', args: string[] = []) {
  const mission = readOption(args, '--mission', 'latest') || 'latest'
  const root = await projectRoot()
  const intervalMs = Math.max(500, Number(readOption(args, '--interval-ms', String(process.env.SKS_ZELLIJ_REFRESH_MS || '1000')) || 1000))
  const once = !flag(args, '--watch')
  for (;;) {
    const snapshot = await readZellijSlotTelemetrySnapshot(root, mission).catch(() => null)
    const text = renderZellijMonitor({ snapshot, missionId: mission, root })
    process.stdout.write(`\x1b[H${text}\n\x1b[0J`)
    if (once) return
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

function readOption(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] ? String(args[index + 1]) : fallback
}

function flag(args: string[], name: string): boolean {
  return args.includes(name)
}
