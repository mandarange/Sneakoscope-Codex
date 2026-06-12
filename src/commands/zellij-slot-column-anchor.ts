import { renderZellijSlotColumnAnchorFromArtifacts } from '../core/zellij/zellij-slot-column-anchor.js'

export async function run(_command: string = 'zellij-slot-column-anchor', args: string[] = []) {
  const missionId = readOption(args, '--mission', 'latest') || 'latest'
  const artifactRoot = readOption(args, '--artifact-root', process.cwd()) || process.cwd()
  const mode = readOption(args, '--mode', 'compact-slots') || 'compact-slots'
  const watch = hasFlag(args, '--watch')
  const intervalMs = Math.max(250, Number(readOption(args, '--interval-ms', '1000') || 1000))
  for (;;) {
    const text = await renderZellijSlotColumnAnchorFromArtifacts({ artifactRoot, missionId, mode })
    // Cursor-home + clear-to-end redraw; `\x1Bc` (RIS) resets the pane's
    // scrollback/modes every tick and intermittently breaks scrolling.
    process.stdout.write('\x1b[H' + text + '\n\x1b[0J')
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
