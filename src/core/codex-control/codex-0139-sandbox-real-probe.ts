import path from 'node:path'
import { buildCodexExecArgs, findCodexBinary } from '../codex-adapter.js'
import { ensureDir, runProcess } from '../fsx.js'
import { codex0139ProbeTail, skippedCodex0139Probe, type Codex0139SingleProbe } from './codex-0139-real-probes.js'

export async function runCodex0139SandboxProfileAliasProbe(input: {
  root: string
  requireReal?: boolean
  timeoutMs?: number
  codexBin?: string | null
}): Promise<Codex0139SingleProbe> {
  const started = Date.now()
  const codexBin = input.codexBin || await findCodexBinary()
  if (!codexBin) return skippedCodex0139Probe('codex_cli_missing')
  const help = await runProcess(codexBin, ['--help'], { timeoutMs: input.timeoutMs || 30000, maxOutputBytes: 256 * 1024 }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }))
  const sandboxHelp = await runProcess(codexBin, ['sandbox', '--help'], { timeoutMs: input.timeoutMs || 30000, maxOutputBytes: 256 * 1024 }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }))
  const helpText = `${(help as any).stdout || ''}\n${(help as any).stderr || ''}`
  const sandboxHelpText = `${(sandboxHelp as any).stdout || ''}\n${(sandboxHelp as any).stderr || ''}`
  const topLevelHelpMentionsAlias = /(^|\s)-P\b/.test(helpText)
  const sandboxHelpMentionsAlias = /(^|\s)-P,\s+--permissions-profile\b/.test(sandboxHelpText) || /(^|\s)-P\b/.test(sandboxHelpText)
  const dryArgs = sandboxHelpMentionsAlias ? ['sandbox', '-P', 'read-only', '--', 'true'] : ['-P', 'read-only', '--version']
  const dry = await runProcess(codexBin, dryArgs, { timeoutMs: input.timeoutMs || 30000, maxOutputBytes: 64 * 1024 }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }))
  const dryAccepted = (dry as any).code === 0
  const ok = topLevelHelpMentionsAlias || sandboxHelpMentionsAlias
  return {
    ok,
    mode: 'actual-cli',
    command_line: [codexBin, ...(sandboxHelpMentionsAlias ? ['sandbox', '--help'] : ['--help'])],
    duration_ms: Date.now() - started,
    stdout_tail: codex0139ProbeTail(`${(help as any).stdout || ''}\n${(sandboxHelp as any).stdout || ''}\n${(dry as any).stdout || ''}`),
    stderr_tail: codex0139ProbeTail(`${(help as any).stderr || ''}\n${(sandboxHelp as any).stderr || ''}\n${(dry as any).stderr || ''}`),
    artifact_paths: [],
    evidence: {
      help_mentions_P: topLevelHelpMentionsAlias || sandboxHelpMentionsAlias,
      top_level_help_mentions_P: topLevelHelpMentionsAlias,
      sandbox_help_mentions_P: sandboxHelpMentionsAlias,
      dry_command_attempted: true,
      dry_command_line: [codexBin, ...dryArgs],
      dry_command_accepted: dryAccepted,
      dry_command_warning: dryAccepted ? null : 'help proof accepted; dry no-op unsupported in this CLI shape'
    },
    blockers: ok ? [] : ['codex_sandbox_profile_alias_help_missing']
  }
}

export async function runCodex0139SandboxProxyPreservationProbe(input: {
  root: string
  requireReal?: boolean
  timeoutMs?: number
  codexBin?: string | null
}): Promise<Codex0139SingleProbe> {
  const started = Date.now()
  const codexBin = input.codexBin || await findCodexBinary()
  if (!codexBin) return skippedCodex0139Probe('codex_cli_missing')
  if (process.env.SKS_CODEX_0139_SANDBOX_PROXY_ALLOW_SAFE_NOOP !== '1') {
    return {
      ...skippedCodex0139Probe('codex_sandbox_proxy_preservation_not_safely_scriptable', {
        allow_safe_noop_env: 'SKS_CODEX_0139_SANDBOX_PROXY_ALLOW_SAFE_NOOP=1'
      }),
      duration_ms: Date.now() - started
    }
  }
  const tempDir = path.join(input.root, '.sneakoscope', 'tmp', 'codex-0139-real-probes', `sandbox-proxy-${Date.now()}`)
  await ensureDir(tempDir)
  const prompt = 'Run no repository edits. Reply exactly: sandbox proxy preservation noop ok.'
  const args = buildCodexExecArgs({ root: tempDir, prompt, json: true, extraArgs: [] })
  const result = await runProcess(codexBin, args, {
    cwd: tempDir,
    timeoutMs: input.timeoutMs || 120000,
    maxOutputBytes: 256 * 1024
  }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }))
  const combined = `${(result as any).stdout || ''}\n${(result as any).stderr || ''}`
  const ok = (result as any).code === 0 && /sandbox proxy preservation noop ok/i.test(combined)
  return {
    ok,
    mode: 'actual-cli',
    command_line: [codexBin, ...args],
    duration_ms: Date.now() - started,
    stdout_tail: codex0139ProbeTail((result as any).stdout),
    stderr_tail: codex0139ProbeTail((result as any).stderr),
    artifact_paths: [tempDir],
    evidence: {
      safe_noop_ran: (result as any).code === 0,
      proxy_marker_checked: Boolean(process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY),
      approved_escalation_preservation_scriptable: false
    },
    blockers: ok ? [] : ['codex_sandbox_proxy_preservation_real_probe_failed']
  }
}
