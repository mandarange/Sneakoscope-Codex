import { wrongnessContextForRoute } from './wrongness-retrieval.js';

export async function activeAvoidanceRules(root: string, opts: { missionId?: string | null; route?: string | null; limit?: number } = {}) {
  const context = await wrongnessContextForRoute(root, opts);
  return context.active_avoidance_rules || [];
}

export function renderAvoidanceRules(rules: unknown = []): string {
  const rows = Array.isArray(rules) ? rules : [];
  if (!rows.length) return 'No active avoidance rules.';
  return rows.map((rule) => {
    const row = rule && typeof rule === 'object' && !Array.isArray(rule) ? rule as Record<string, unknown> : {};
    return `- ${String(row.id || 'avoidance-rule')}: ${String(row.text || '').trim()}`;
  }).join('\n');
}
