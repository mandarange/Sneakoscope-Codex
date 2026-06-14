import { repairZellijForSks, type ZellijSelfHealResult } from '../zellij/zellij-self-heal.js'

export async function runDoctorZellijRepair(input: {
  root: string
  args: string[]
  doctorFix: boolean
}): Promise<ZellijSelfHealResult | null> {
  const args = (input.args || []).map(String)
  if (input.doctorFix !== true) return null
  return repairZellijForSks({
    root: input.root,
    requestedBy: 'doctor --fix',
    fixRequested: true,
    autoApprove: args.includes('--yes') || args.includes('-y'),
    installHomebrew: args.includes('--install-homebrew') || process.env.SKS_ALLOW_HOMEBREW_INSTALL === '1',
    dryRun: args.includes('--dry-run'),
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY && process.env.SKS_NO_QUESTION !== '1'),
    allowHeadlessFallback: false,
    env: process.env
  })
}

export function doctorZellijRepairConsoleLine(result: ZellijSelfHealResult | null): string | null {
  if (!result) return null
  if (result.dry_run) {
    const planned = result.planned_mutations.map((row) => row.command).join(' && ') || result.command || 'none'
    return `Zellij repair: dry_run planned ${planned}`
  }
  if (result.strategy === 'none-current') return `Zellij repair: current ${result.after.version || ''}`.trim()
  if (result.ok && (result.strategy === 'brew-install-zellij' || result.strategy === 'brew-install-homebrew-then-zellij')) {
    return `Zellij repair: installed ${result.after.version || 'latest'} via ${result.command || 'brew install zellij'}`
  }
  if (result.ok && result.strategy === 'brew-upgrade-zellij') {
    return `Zellij repair: upgraded ${result.before.version || 'unknown'} -> ${result.after.version || 'latest'} via ${result.command || 'brew upgrade zellij'}`
  }
  if (result.strategy === 'manual-required') {
    return `Zellij repair: manual_required\nRun: ${result.command || 'sks doctor --fix --install-homebrew --yes'}`
  }
  if (result.strategy === 'headless-fallback') return 'Zellij repair: headless_fallback live_panes=false'
  return `Zellij repair: failed\nRun: ${result.command || 'sks doctor --fix --yes'}`
}
