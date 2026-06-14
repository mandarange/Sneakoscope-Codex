// @ts-nocheck
import readline from 'node:readline'

export interface HomebrewPolicyDecision {
  schema: 'sks.homebrew-policy.v1'
  allowed: boolean
  source: 'flag' | 'yes_install_homebrew' | 'interactive_confirmed' | 'env' | 'not_allowed'
  install_command: string
  blockers: string[]
}

export const HOMEBREW_INSTALL_COMMAND = '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'

export function resolveHomebrewInstallPolicy(input: {
  args?: string[]
  env?: NodeJS.ProcessEnv
  installHomebrew?: boolean
  autoApprove?: boolean
  interactiveAccepted?: boolean
} = {}): HomebrewPolicyDecision {
  const args = (input.args || []).map(String)
  const env = input.env || process.env
  const hasFlag = input.installHomebrew === true || args.includes('--install-homebrew')
  const hasYes = input.autoApprove === true || args.includes('--yes') || args.includes('-y')
  const envAllowed = env.SKS_ALLOW_HOMEBREW_INSTALL === '1'
  const interactiveAccepted = input.interactiveAccepted === true
  const allowed = envAllowed || interactiveAccepted || (hasFlag && hasYes)
  const source = envAllowed ? 'env'
    : interactiveAccepted ? 'interactive_confirmed'
      : hasFlag && hasYes ? 'yes_install_homebrew'
        : hasFlag ? 'flag'
          : 'not_allowed'
  return {
    schema: 'sks.homebrew-policy.v1',
    allowed,
    source,
    install_command: HOMEBREW_INSTALL_COMMAND,
    blockers: allowed ? [] : ['homebrew_install_requires_explicit_approval']
  }
}

export function homebrewMissingDoctorMessage() {
  return [
    'Zellij repair: Homebrew missing. Run:',
    '  sks doctor --fix --install-homebrew --yes',
    'or install Homebrew manually, then:',
    '  sks doctor --fix --yes'
  ].join('\n')
}

export async function askHomebrewInstallAllowed(question = 'Homebrew is missing. Install Homebrew now? [y/N] '): Promise<boolean> {
  if (!(process.stdin.isTTY && process.stdout.isTTY)) return false
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await new Promise<string>((resolve) => rl.question(question, resolve))
    return /^(y|yes|예|네|응)$/i.test(String(answer || '').trim())
  } finally {
    rl.close()
  }
}
