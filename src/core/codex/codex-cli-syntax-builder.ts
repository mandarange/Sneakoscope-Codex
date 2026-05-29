export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'

export type CodexServiceTier = 'fast' | 'standard' | 'default' | 'flex' | 'auto'

export type BuildCodexExecArgsOptions = {
  json?: boolean
  outputSchema?: string | null
  outputLastMessage?: string | null
  ephemeral?: boolean
  skipGitRepoCheck?: boolean
  profile?: string | null
  ignoreUserConfig?: boolean
  ignoreRules?: boolean
  sandbox?: CodexSandboxMode
  serviceTier?: CodexServiceTier | null
  fullAuto?: boolean
  allowFullAuto?: boolean
  danger?: boolean
  allowDanger?: boolean
  prompt: string
}

export function buildCodexExecArgs(opts: BuildCodexExecArgsOptions): string[] {
  if (opts.fullAuto && opts.danger) {
    throw new Error('codex exec cannot combine full auto and danger modes')
  }
  if (opts.danger && !opts.allowDanger) {
    throw new Error('codex exec danger mode requires explicit allowDanger=true')
  }
  if (opts.fullAuto && !opts.allowFullAuto) {
    throw new Error('codex exec full-auto mode requires explicit allowFullAuto=true')
  }
  if (opts.profile && opts.ignoreUserConfig) {
    throw new Error('codex exec cannot combine --profile with --ignore-user-config')
  }

  const args = ['exec']
  if (opts.json) args.push('--json')
  if (opts.outputSchema) args.push('--output-schema', opts.outputSchema)
  if (opts.outputLastMessage) args.push('--output-last-message', opts.outputLastMessage)
  if (opts.ephemeral) args.push('--ephemeral')
  if (opts.skipGitRepoCheck) args.push('--skip-git-repo-check')
  if (opts.profile) args.push('--profile', opts.profile)
  else if (opts.ignoreUserConfig) args.push('--ignore-user-config')
  if (opts.ignoreRules) args.push('--ignore-rules')
  if (opts.fullAuto) args.push('--full-auto')
  if (opts.danger) args.push('--dangerously-bypass-approvals-and-sandbox')
  else if (opts.sandbox) args.push('--sandbox', opts.sandbox)
  if (opts.serviceTier) args.push('-c', `service_tier=${opts.serviceTier}`)
  args.push(opts.prompt)
  return args
}
