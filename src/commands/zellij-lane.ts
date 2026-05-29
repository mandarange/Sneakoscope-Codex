import { flag } from '../cli/args.js'
import { printJson } from '../cli/output.js'
import { runZellijLaneRenderer } from '../core/zellij/zellij-lane-renderer.js'

export async function run(_command: any, args: any = []) {
  const missionId = readOption(args, '--mission', 'latest')
  const slot = readOption(args, '--slot', 'slot-001')
  const ledgerRoot = readOption(args, '--ledger-root', process.cwd())
  const result = await runZellijLaneRenderer({
    missionId,
    slot,
    ledgerRoot,
    follow: flag(args, '--follow'),
    once: flag(args, '--once') || !flag(args, '--follow'),
    maxIterations: Number(readOption(args, '--max-iterations', '0')) || 0
  })
  if (flag(args, '--json')) printJson({ schema: 'sks.zellij-lane-command.v1', ...result })
}

function readOption(args: any[] = [], name: string, fallback: string): string {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] ? String(args[index + 1]) : fallback
}
