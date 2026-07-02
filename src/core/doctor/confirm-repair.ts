import readline from 'node:readline'

export interface ConfirmRepairResult {
  approved: boolean
  reason: 'auto_approved' | 'interactive_confirmed' | 'operator_declined' | 'non_interactive_requires_yes'
  next_actions: string[]
}

export async function confirmRepair(input: {
  autoApprove?: boolean
  interactive?: boolean
  question: string
}): Promise<ConfirmRepairResult> {
  if (input.autoApprove === true) return { approved: true, reason: 'auto_approved', next_actions: [] }
  if (input.interactive !== true || !(process.stdin.isTTY && process.stdout.isTTY)) {
    return {
      approved: false,
      reason: 'non_interactive_requires_yes',
      next_actions: ['Rerun with `--yes` to approve this repair in a non-interactive environment.']
    }
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await new Promise<string>((resolve) => rl.question(input.question, resolve))
    const trimmed = String(answer || '').trim()
    const approved = trimmed === '' || /^(y|yes|예|네|응)$/i.test(trimmed)
    return {
      approved,
      reason: approved ? 'interactive_confirmed' : 'operator_declined',
      next_actions: approved ? [] : ['Rerun with `--yes` when you are ready to approve this repair.']
    }
  } finally {
    rl.close()
  }
}
