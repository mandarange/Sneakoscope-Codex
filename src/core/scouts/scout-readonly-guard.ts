import fs from 'node:fs/promises';
import path from 'node:path';
import { listFilesRecursive, rel, sha256 } from '../fsx.js';

const DEFAULT_IGNORES = Object.freeze([
  '.git',
  'node_modules',
  '.sneakoscope/arenas',
  '.sneakoscope/state',
  '.sneakoscope/tmp'
]);

export async function snapshotScoutReadableTree(root: any, { missionId }: any = {}) {
  const files = await listFilesRecursive(root, { ignore: [...DEFAULT_IGNORES], maxFiles: 100000 });
  const entries: Record<string, any> = {};
  for (const file of files) {
    const relative = rel(root, file);
    if (isVolatileRuntimePath(relative)) continue;
    if (isAllowedScoutWrite(relative, missionId)) continue;
    const current = await readStableFile(file);
    if (!current) continue;
    const { data, stat } = current;
    entries[relative] = {
      sha256: sha256(data),
      size: stat.size
    };
  }
  return {
    schema: 'sks.scout-readonly-snapshot.v1',
    mission_id: missionId || null,
    file_count: Object.keys(entries).length,
    entries
  };
}

async function readStableFile(file: any) {
  try {
    const data = await fs.readFile(file);
    const stat = await fs.stat(file);
    return { data, stat };
  } catch (err: any) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
}

function isVolatileRuntimePath(relativePath: any) {
  const relPath = String(relativePath || '').split(path.sep).join('/');
  if (/^\.sneakoscope\/state\//.test(relPath)) return true;
  if (/^\.sneakoscope\/.*\.tmp$/.test(relPath)) return true;
  return false;
}

export async function assertScoutReadOnly(root: any, before: any, { missionId }: any = {}) {
  const after = await snapshotScoutReadableTree(root, { missionId });
  const violations: any[] = [];
  const beforeEntries = before?.entries || {};
  const afterEntries = after.entries || {};
  const paths = new Set([...Object.keys(beforeEntries), ...Object.keys(afterEntries)]);
  for (const relative of [...paths].sort()) {
    if (isAllowedScoutWrite(relative, missionId)) continue;
    const prev = beforeEntries[relative];
    const next = afterEntries[relative];
    if (!prev && next) violations.push({ path: relative, kind: 'added' });
    else if (prev && !next) violations.push({ path: relative, kind: 'removed' });
    else if (prev && next && prev.sha256 !== next.sha256) violations.push({ path: relative, kind: 'modified' });
  }
  return {
    schema: 'sks.scout-readonly-guard.v1',
    mission_id: missionId || null,
    passed: violations.length === 0,
    allowed_writes: allowedScoutWriteGlobs(missionId),
    violations
  };
}

export function isAllowedScoutWrite(relativePath: any, missionId: any) {
  const relPath = String(relativePath || '').split(path.sep).join('/');
  if (!relPath) return false;
  if (missionId && relPath.startsWith(`.sneakoscope/missions/${missionId}/`)) {
    const name = relPath.slice(`.sneakoscope/missions/${missionId}/`.length);
    return /^scout-/.test(name) || [
      'scout-team-plan.json',
      'scout-consensus.json',
      'scout-handoff.md',
      'scout-gate.json',
      'scout-performance.json',
      'scout-engine-result.json',
      'scout-readonly-guard.json'
    ].includes(name);
  }
  if (/^\.sneakoscope\/reports\/scout-[^/]+\.(json|md|jsonl)$/.test(relPath)) return true;
  return false;
}

export function allowedScoutWriteGlobs(missionId: any) {
  return [
    `.sneakoscope/missions/${missionId || '<mission-id>'}/scout-*`,
    '.sneakoscope/reports/scout-*'
  ];
}
