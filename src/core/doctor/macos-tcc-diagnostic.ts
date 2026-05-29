import path from 'node:path'

export function macosTccDiagnostic(rootInput: string = process.cwd(), blockers: string[] = []) {
  const root = path.resolve(rootInput || process.cwd())
  const tccRisk = process.platform === 'darwin' && /\/(Desktop|Documents|Library\/Mobile Documents|iCloud Drive|Volumes)\//.test(root)
  const eperm = blockers.some((blocker) => /eperm|EPERM|operation_not_permitted/i.test(blocker))
  return {
    schema: 'sks.macos-tcc-diagnostic.v1',
    ok: !(tccRisk && eperm),
    root,
    tcc_risk: tccRisk,
    tcc_probable: tccRisk && eperm,
    operator_actions: tccRisk && eperm ? [
      'System Settings -> Privacy & Security -> Full Disk Access: grant access to Warp, Terminal, iTerm, Codex app, and the app that launches Codex CLI.',
      'System Settings -> Privacy & Security -> Files and Folders: allow Desktop/Documents/iCloud access when the project is under those locations.',
      'After granting access, fully restart the terminal/Codex app and run `sks mad repair-config --apply --tmux-smoke`.'
    ] : []
  }
}
