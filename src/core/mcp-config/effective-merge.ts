import type { McpServerConfigV2 } from './types.js';

const PRECEDENCE: Record<McpServerConfigV2['scope'], number> = {
  plugin: 0,
  global: 1,
  project: 2
};

export function mergeEffectiveMcpServers(groups: readonly (readonly McpServerConfigV2[])[]): McpServerConfigV2[] {
  const byName = new Map<string, McpServerConfigV2[]>();
  for (const server of groups.flat()) {
    const rows = byName.get(server.name) || [];
    rows.push(server);
    byName.set(server.name, rows);
  }
  const merged: McpServerConfigV2[] = [];
  for (const [name, rows] of byName) {
    const ordered = [...rows].sort((left, right) => PRECEDENCE[right.scope] - PRECEDENCE[left.scope]);
    const winner = ordered[0];
    if (!winner) continue;
    const shadowed = ordered.slice(1).map((row) => ({ scope: row.scope, source_path: row.source_path }));
    merged.push({ ...winner, ...(shadowed.length ? { shadowed_sources: shadowed } : {}) });
    void name;
  }
  return merged.sort((left, right) => left.name.localeCompare(right.name));
}
