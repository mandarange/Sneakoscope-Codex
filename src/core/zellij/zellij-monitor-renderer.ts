import { resolveZellijTheme, paint, statusBadge, progressBar, elapsed, ANSI_CODES } from './zellij-theme.js'
import type { ZellijSlotTelemetrySnapshot } from './zellij-slot-telemetry.js'

export function renderZellijMonitor(input: { snapshot: ZellijSlotTelemetrySnapshot | null; missionId: string; root: string }): string {
  const theme = resolveZellijTheme()
  const width = theme.width
  const slots = Object.entries(input.snapshot?.slots || {}).map(([key, value]) => ({ key, ...(value as any) }))
  const now = Date.now()
  const by = (statuses: string[]) => slots.filter((slot) => statuses.includes(String(slot.status || '').toLowerCase()))
  const running = by(['running'])
  const verifying = by(['verifying'])
  const queued = by(['queued', 'launching'])
  const done = by(['done', 'completed', 'drained'])
  const failed = by(['failed', 'blocked', 'timed_out'])
  const generations = [...new Set(slots.map((slot) => Number(slot.generation_index || 1)))].sort((a, b) => b - a)
  const line1 = [
    paint(theme, ANSI_CODES.green, `run ${running.length}`),
    paint(theme, ANSI_CODES.cyan, `verify ${verifying.length}`),
    paint(theme, ANSI_CODES.gray, `queue ${queued.length}`),
    paint(theme, ANSI_CODES.green, `done ${done.length}`),
    paint(theme, ANSI_CODES.red, `fail ${failed.length}`)
  ].join('  ')
  const line2 = paint(theme, ANSI_CODES.dim, `gen-${generations[0] || 1} active | spawned ${slots.length} total | flush #${input.snapshot?.flush_count ?? '-'}`)
  const maxRows = Math.max(4, Number(process.env.SKS_ZELLIJ_MONITOR_ROWS || 12))
  const activityTs = (slot: any) => Date.parse(String(slot.latest_ts || '')) || 0
  const visible = [...failed.filter((slot) => now - activityTs(slot) < 3 * 60_000), ...running, ...verifying, ...queued]
    .sort((a, b) => activityTs(b) - activityTs(a) || String(a.key).localeCompare(String(b.key)))
    .slice(0, maxRows)
  const failedKeys = new Set(failed.map((slot) => slot.key))
  const rows = visible.map((slot) => {
    const prog = slot.progress?.total > 0
      ? progressBar(theme, slot.progress.done, slot.progress.total, 6)
      : paint(theme, ANSI_CODES.dim, elapsed(slot.latest_ts) || '')
    const doing = firstMeaningfulLine(slot.task_title) || slot.current_file || ''
    return `${statusBadge(theme, slot.status)} ${String(slot.slot_id).padEnd(9)} g${slot.generation_index ?? 1} ${String(slot.role || '').slice(0, 9).padEnd(9)} ${prog}  ${clip(doing, width - 42)}`
  })
  const hiddenActive = Math.max(0, running.length + verifying.length + queued.length - visible.filter((slot) => !failedKeys.has(slot.key)).length)
  const footerParts = [
    hiddenActive ? `+${hiddenActive} more active` : null,
    done.length ? `+${done.length} done` : null,
    failed.length ? `+${failed.length} failed` : null
  ].filter((part): part is string => Boolean(part))
  const footer = paint(theme, ANSI_CODES.dim, footerParts.join(' | ') || 'all agents visible')
  return [line1, line2, paint(theme, ANSI_CODES.dim, '-'.repeat(Math.max(10, width - 2))), ...rows, footer].join('\n')
}

function firstMeaningfulLine(s: unknown): string {
  return String(s || '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !/^Parent |^Naruto owner|^Allocation|^Read-only/i.test(line)) || ''
}

function clip(s: string, w: number): string {
  return s.length > w ? `${s.slice(0, Math.max(0, w - 1))}…` : s
}
