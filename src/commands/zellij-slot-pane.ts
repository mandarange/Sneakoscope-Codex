import { renderZellijSlotPaneFromArtifacts } from '../core/zellij/zellij-slot-pane-renderer.js'

export async function run(_command: string = 'zellij-slot-pane', args: string[] = []) {
  const artifactDir = readOption(args, '--artifact-dir', process.cwd()) || process.cwd()
  const slotId = readOption(args, '--slot', 'slot-001') || 'slot-001'
  const generationIndex = Number(readOption(args, '--generation', '1') || 1)
  const backend = readOption(args, '--backend', null)
  const role = readOption(args, '--role', null)
  const mode = readOption(args, '--mode', 'compact-slots') as any
  const watch = hasFlag(args, '--watch')
  const intervalMs = Math.max(250, Number(readOption(args, '--interval-ms', '1000') || 1000))
  for (;;) {
    const text = await renderZellijSlotPaneFromArtifacts({ artifactDir, slotId, generationIndex, backend, role, mode })
    process.stdout.write('\x1Bc' + text + '\n')
    if (!watch) break
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

function readOption(args: string[], name: string, fallback: string): string
function readOption(args: string[], name: string, fallback: string | null): string | null
function readOption(args: string[], name: string, fallback: string | null): string | null {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] ? String(args[index + 1]) : fallback
}

function hasFlag(args: string[], flag: string) {
  return args.includes(flag)
}
