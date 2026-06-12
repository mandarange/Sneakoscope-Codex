import path from 'node:path';
import { readJson } from '../fsx.js';

export interface LoopGateDefinition {
  id: string;
  command: string;
  source: 'package-json' | 'release-gates-v2' | 'builtin-pseudo';
  side_effect: 'hermetic' | 'read-only' | 'mutation' | 'human';
  timeout_ms: number;
  cache_allowed: boolean;
}

interface ReleaseGateV2 {
  id?: unknown;
  command?: unknown;
  side_effect?: unknown;
  timeout_ms?: unknown;
  cache?: { enabled?: unknown } | null;
}

export async function resolveLoopGate(root: string, gateId: string): Promise<LoopGateDefinition | null> {
  const builtin = builtinLoopGate(gateId);
  if (builtin) return builtin;
  const releaseGate = await resolveReleaseGate(root, gateId);
  if (releaseGate) return releaseGate;
  const packageGate = await resolvePackageScriptGate(root, gateId);
  if (packageGate) return packageGate;
  return null;
}

export async function listLoopGateDefinitions(root: string): Promise<LoopGateDefinition[]> {
  const packageJson = await readJson<any>(path.join(root, 'package.json'), {});
  const release = await readJson<{ gates?: ReleaseGateV2[] }>(path.join(root, 'release-gates.v2.json'), {});
  const packageScripts = packageJson && typeof packageJson === 'object' && packageJson.scripts && typeof packageJson.scripts === 'object'
    ? Object.keys(packageJson.scripts)
    : [];
  const releaseGates = Array.isArray(release.gates) ? release.gates : [];
  const definitions = [
    ...['gpt:final-arbiter', 'human:handoff-required', 'loop:checker-fresh-session', 'loop:state-valid', 'loop:budget-valid'].map((id) => builtinLoopGate(id)).filter((row): row is LoopGateDefinition => Boolean(row)),
    ...releaseGates.map((gate) => normalizeReleaseGate(gate)).filter((row): row is LoopGateDefinition => Boolean(row)),
    ...packageScripts.map((id) => ({
      id,
      command: `npm run ${shellQuote(id)} --silent`,
      source: 'package-json' as const,
      side_effect: 'hermetic' as const,
      timeout_ms: 300000,
      cache_allowed: true
    }))
  ];
  const byId = new Map<string, LoopGateDefinition>();
  for (const definition of definitions) if (!byId.has(definition.id)) byId.set(definition.id, definition);
  return [...byId.values()];
}

function builtinLoopGate(gateId: string): LoopGateDefinition | null {
  if (gateId === 'gpt:final-arbiter') {
    return { id: gateId, command: 'builtin:gpt-final-arbiter', source: 'builtin-pseudo', side_effect: 'read-only', timeout_ms: 300000, cache_allowed: false };
  }
  if (gateId === 'human:handoff-required') {
    return { id: gateId, command: 'builtin:human-handoff-required', source: 'builtin-pseudo', side_effect: 'human', timeout_ms: 0, cache_allowed: false };
  }
  if (gateId === 'loop:checker-fresh-session') {
    return { id: gateId, command: 'builtin:loop-checker-fresh-session', source: 'builtin-pseudo', side_effect: 'read-only', timeout_ms: 30000, cache_allowed: false };
  }
  if (gateId === 'loop:state-valid') {
    return { id: gateId, command: 'builtin:loop-state-valid', source: 'builtin-pseudo', side_effect: 'read-only', timeout_ms: 30000, cache_allowed: true };
  }
  if (gateId === 'loop:budget-valid') {
    return { id: gateId, command: 'builtin:loop-budget-valid', source: 'builtin-pseudo', side_effect: 'read-only', timeout_ms: 30000, cache_allowed: true };
  }
  return null;
}

async function resolveReleaseGate(root: string, gateId: string): Promise<LoopGateDefinition | null> {
  const release = await readJson<{ gates?: ReleaseGateV2[] }>(path.join(root, 'release-gates.v2.json'), {});
  const gate = Array.isArray(release.gates) ? release.gates.find((row) => row.id === gateId) : null;
  return gate ? normalizeReleaseGate(gate) : null;
}

function normalizeReleaseGate(gate: ReleaseGateV2): LoopGateDefinition | null {
  const id = String(gate.id || '');
  const command = String(gate.command || '');
  if (!id || !command) return null;
  return {
    id,
    command,
    source: 'release-gates-v2',
    side_effect: normalizeSideEffect(gate.side_effect),
    timeout_ms: Number.isFinite(Number(gate.timeout_ms)) ? Math.max(1, Number(gate.timeout_ms)) : 300000,
    cache_allowed: gate.cache?.enabled !== false
  };
}

async function resolvePackageScriptGate(root: string, gateId: string): Promise<LoopGateDefinition | null> {
  const packageJson = await readJson<any>(path.join(root, 'package.json'), {});
  if (!packageJson?.scripts || typeof packageJson.scripts !== 'object' || !(gateId in packageJson.scripts)) return null;
  return {
    id: gateId,
    command: `npm run ${shellQuote(gateId)} --silent`,
    source: 'package-json',
    side_effect: 'hermetic',
    timeout_ms: 300000,
    cache_allowed: true
  };
}

function normalizeSideEffect(value: unknown): LoopGateDefinition['side_effect'] {
  return value === 'read-only' || value === 'mutation' || value === 'human' ? value : 'hermetic';
}

function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}
