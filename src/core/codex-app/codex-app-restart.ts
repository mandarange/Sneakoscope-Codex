import { exists, runProcess, which } from '../fsx.js'

export interface CodexAppRestartResult {
  schema: 'sks.codex-app-restart.v1'
  ok: boolean
  status: string
  skipped?: boolean
  reason?: string
  app_name: string
  quit?: { ok: boolean; code: number | null; error?: string | null }
  open?: { ok: boolean; code: number | null; error?: string | null }
  blockers: string[]
}

export async function restartCodexApp(opts: {
  enabled?: boolean
  appName?: string
  delayMs?: number
  env?: NodeJS.ProcessEnv
  runProcessImpl?: typeof runProcess
} = {}): Promise<CodexAppRestartResult> {
  const env = opts.env || process.env
  const appName = String(opts.appName || env.SKS_CODEX_APP_NAME || 'Codex')
  if (opts.enabled === false || env.SKS_SKIP_CODEX_APP_RESTART === '1') {
    return skipped(appName, 'disabled')
  }
  if (process.platform !== 'darwin') return skipped(appName, 'not_macos')
  const run = opts.runProcessImpl || runProcess
  const osascript = await which('osascript').catch(() => null) || await exists('/usr/bin/osascript').then((ok) => ok ? '/usr/bin/osascript' : null).catch(() => null)
  const open = await which('open').catch(() => null) || await exists('/usr/bin/open').then((ok) => ok ? '/usr/bin/open' : null).catch(() => null)
  if (!osascript || !open) {
    return {
      schema: 'sks.codex-app-restart.v1',
      ok: false,
      status: 'blocked',
      app_name: appName,
      blockers: [
        ...(osascript ? [] : ['osascript_missing']),
        ...(open ? [] : ['open_missing'])
      ]
    }
  }
  const quit = await run(osascript, ['-e', `tell application ${JSON.stringify(appName)} to quit`], { timeoutMs: 5000, maxOutputBytes: 8192 }).catch((err: any) => ({
    code: 1,
    stdout: '',
    stderr: err?.message || String(err)
  }))
  await sleep(Number(opts.delayMs ?? env.SKS_CODEX_APP_RESTART_DELAY_MS ?? 1200))
  const launched = await run(open, ['-a', appName], { timeoutMs: 10000, maxOutputBytes: 8192 }).catch((err: any) => ({
    code: 1,
    stdout: '',
    stderr: err?.message || String(err)
  }))
  const quitOk = quit.code === 0 || /not running|Can't get application|application isn't running/i.test(String(quit.stderr || quit.stdout || ''))
  const openOk = launched.code === 0
  return {
    schema: 'sks.codex-app-restart.v1',
    ok: quitOk && openOk,
    status: quitOk && openOk ? 'restarted' : 'blocked',
    app_name: appName,
    quit: { ok: quitOk, code: quit.code, error: quitOk ? null : String(quit.stderr || quit.stdout || '').trim() },
    open: { ok: openOk, code: launched.code, error: openOk ? null : String(launched.stderr || launched.stdout || '').trim() },
    blockers: [
      ...(quitOk ? [] : ['codex_app_quit_failed']),
      ...(openOk ? [] : ['codex_app_open_failed'])
    ]
  }
}

function skipped(appName: string, reason: string): CodexAppRestartResult {
  return {
    schema: 'sks.codex-app-restart.v1',
    ok: true,
    status: 'skipped',
    skipped: true,
    reason,
    app_name: appName,
    blockers: []
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
}
