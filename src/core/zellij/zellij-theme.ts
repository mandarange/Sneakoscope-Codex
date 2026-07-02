export interface ZellijTheme {
  color: boolean
  width: number
  statusIcon: Record<string, string>
  statusColor: Record<string, string>
}

const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m'
}

export function resolveZellijTheme(): ZellijTheme {
  const noColor = process.env.NO_COLOR === '1' || process.env.SKS_ZELLIJ_COLOR === '0'
  return {
    color: !noColor && process.stdout.isTTY !== false,
    width: Math.min(Math.max(Number(process.stdout.columns) || 100, 60), 140),
    statusIcon: {
      running: '●',
      verifying: '◍',
      queued: '◌',
      launching: '◌',
      done: '✔',
      completed: '✔',
      failed: '✖',
      blocked: '■',
      timed_out: '⏱',
      headless: '·',
      drained: '✔'
    },
    statusColor: {
      running: ANSI.green,
      verifying: ANSI.cyan,
      queued: ANSI.gray,
      launching: ANSI.gray,
      done: ANSI.green,
      completed: ANSI.green,
      failed: ANSI.red,
      blocked: ANSI.yellow,
      timed_out: ANSI.red,
      headless: ANSI.gray,
      drained: ANSI.green
    }
  }
}

export function paint(theme: ZellijTheme, code: string, text: string): string {
  return theme.color && code ? `${code}${text}${ANSI.reset}` : text
}

export function statusBadge(theme: ZellijTheme, status: string): string {
  const s = String(status || 'queued').toLowerCase()
  const icon = theme.statusIcon[s] || '●'
  return paint(theme, theme.statusColor[s] || '', `${icon} ${s}`)
}

export function progressBar(theme: ZellijTheme, done: number, total: number, width = 10): string {
  if (!Number.isFinite(total) || total <= 0) return ''
  const filled = Math.max(0, Math.min(width, Math.round((done / total) * width)))
  return `${paint(theme, ANSI.green, '▉'.repeat(filled))}${paint(theme, ANSI.gray, '▁'.repeat(width - filled))} ${done}/${total}`
}

export function elapsed(sinceIso: string | null | undefined): string {
  const t = Date.parse(String(sinceIso || ''))
  if (!Number.isFinite(t)) return ''
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export const ANSI_CODES = ANSI
