
export function renderAvoidanceRules(rules: unknown = []): string {
  const rows = Array.isArray(rules) ? rules : [];
  if (!rows.length) return 'No active avoidance rules.';
  return rows.map((rule) => {
    const row = rule && typeof rule === 'object' && !Array.isArray(rule) ? rule as Record<string, unknown> : {};
    return `- ${String(row.id || 'avoidance-rule')}: ${String(row.text || '').trim()}`;
  }).join('\n');
}
