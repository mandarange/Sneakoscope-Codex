export function normalizeAgentSessionRows(sessions: any): any[] {
  const raw = sessions?.sessions ?? sessions
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') {
    return Object.entries(raw).map(([id, row]) => {
      if (row && typeof row === 'object') return { id, ...(row as Record<string, unknown>) }
      return { id, status: String(row ?? '') }
    })
  }
  return []
}
