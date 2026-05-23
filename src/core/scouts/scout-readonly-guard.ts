import fs from 'node:fs/promises';
import path from 'node:path';
import { listFilesRecursive, rel, runProcess, sha256 } from '../fsx.js';

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
    root,
    file_count: Object.keys(entries).length,
    git_status: await gitStatusSnapshot(root, { missionId }),
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
  const gitDelta = gitStatusDelta(before?.git_status, after.git_status, missionId);
  for (const row of gitDelta.disallowed) {
    violations.push({ path: row.path, kind: 'git_status_changed', status: row.status });
  }
  return {
    schema: 'sks.scout-readonly-guard.v2',
    mission_id: missionId || null,
    passed: violations.length === 0,
    allowed_writes: allowedScoutWriteGlobs(missionId),
    disallowed_writes: violations,
    before_file_count: before?.file_count ?? null,
    after_file_count: after.file_count,
    git_status_before: before?.git_status || null,
    git_status_after: after.git_status,
    git_status_delta: gitDelta,
    external_boundary: {
      root,
      external_workspace_writes_allowed: false,
      remote_workspace_writes_allowed: false
    },
    wrongness_record_required: violations.length > 0,
    violations
  };
}

export function isAllowedScoutWrite(relativePath: any, missionId: any) {
  const relPath = String(relativePath || '').split(path.sep).join('/');
  if (!relPath) return false;
  if (isAmbientMissionRuntimePath(relPath, missionId)) return true;
  if (missionId && relPath.startsWith(`.sneakoscope/missions/${missionId}/`)) {
    const name = relPath.slice(`.sneakoscope/missions/${missionId}/`.length);
    if (name.startsWith('scout-benchmarks/')) return true;
    return /^scout-/.test(name) || [
      'context7-evidence.jsonl',
      'scout-team-plan.json',
      'scout-consensus.json',
      'scout-handoff.md',
      'scout-gate.json',
      'scout-performance.json',
      'scout-engine-result.json',
      'scout-engine-unavailable.json',
      'scout-readonly-guard.json',
      'subagent-evidence.jsonl',
      'wrongness-ledger.json',
      'wrongness-summary.md',
      'wrongness-triwiki-links.json'
    ].includes(name);
  }
  if (/^\.sneakoscope\/reports\/scout-[^/]+\.(json|md|jsonl)$/.test(relPath)) return true;
  if (/^\.sneakoscope\/wiki\/wrongness-(index|ledger|summary)\.(json|md)$/.test(relPath)) return true;
  return false;
}

function isAmbientMissionRuntimePath(relPath: string, missionId: any) {
  if (!missionId) return false;
  const match = /^\.sneakoscope\/missions\/([^/]+)\//.exec(relPath);
  return Boolean(match && match[1] !== missionId);
}

export function allowedScoutWriteGlobs(missionId: any) {
  return [
    `.sneakoscope/missions/${missionId || '<mission-id>'}/scout-*`,
    `.sneakoscope/missions/${missionId || '<mission-id>'}/scout-benchmarks/**`,
    `.sneakoscope/missions/${missionId || '<mission-id>'}/context7-evidence.jsonl`,
    `.sneakoscope/missions/${missionId || '<mission-id>'}/subagent-evidence.jsonl`,
    `.sneakoscope/missions/${missionId || '<mission-id>'}/wrongness-*`,
    '.sneakoscope/missions/<other-mission-id>/**',
    '.sneakoscope/wiki/wrongness-*',
    '.sneakoscope/reports/scout-*'
  ];
}

async function gitStatusSnapshot(root: any, { missionId }: any = {}) {
  const result = await runProcess('git', ['status', '--short', '--untracked-files=all'], {
    cwd: root,
    timeoutMs: 5000,
    maxOutputBytes: 256 * 1024
  }).catch((err: any) => ({ code: 1, stdout: '', stderr: err.message }));
  const lines = String(result.stdout || '').split(/\r?\n/).filter(Boolean);
  const entries = lines.map((line) => {
    const parsed = parseGitStatusLine(line);
    return {
      raw: line,
      status: parsed.status,
      path: parsed.path,
      allowed: isAllowedScoutWrite(parsed.path, missionId)
    };
  });
  return {
    schema: 'sks.scout-readonly-git-status.v1',
    ok: result.code === 0,
    entry_count: entries.length,
    entries,
    error: result.code === 0 ? null : String(result.stderr || result.stdout || '').trim()
  };
}

function gitStatusDelta(before: any = {}, after: any = {}, missionId: any = null) {
  const beforeMap = new Map((before?.entries || []).map((row: any) => [row.raw, row]));
  const afterRows = after?.entries || [];
  const changed = afterRows.filter((row: any) => !beforeMap.has(row.raw));
  const allowed = changed.filter((row: any) => row.allowed || isAllowedScoutWrite(row.path, missionId));
  const disallowed = changed.filter((row: any) => !row.allowed && !isAllowedScoutWrite(row.path, missionId));
  return {
    schema: 'sks.scout-readonly-git-status-delta.v1',
    changed,
    allowed,
    disallowed
  };
}

function parseGitStatusLine(line: any) {
  const raw = String(line || '');
  const status = raw.slice(0, 2).trim() || 'unknown';
  let filePath = raw.slice(3).trim();
  if (filePath.includes(' -> ')) filePath = filePath.split(' -> ').pop() || filePath;
  return {
    status,
    path: filePath.split(path.sep).join('/')
  };
}
