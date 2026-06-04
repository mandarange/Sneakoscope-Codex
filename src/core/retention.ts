import fs from 'node:fs/promises';
import path from 'node:path';
import { exists, readJson, writeJsonAtomic, ensureDir, dirSize, fileSize, formatBytes, rmrf, nowIso, appendJsonlBounded, listFilesRecursive } from './fsx.js';
import { FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_SESSIONS } from './routes.js';

export const DEFAULT_RETENTION_POLICY = Object.freeze({
  schema_version: 1,
  max_missions: 30,
  max_mission_age_days: 14,
  max_sneakoscope_bytes: 256 * 1024 * 1024,
  max_mission_bytes: 64 * 1024 * 1024,
  max_event_log_bytes: 5 * 1024 * 1024,
  max_tmp_age_hours: 0,
  keep_last_cycles_per_mission: 3,
  run_gc_after_each_cycle: true,
  compact_oversize_missions: false,
  compact_closed_mission_workdirs: true,
  prune_disposable_report_logs: false,
  max_wiki_artifacts: 40,
  max_wiki_artifact_age_days: 30,
  max_wiki_scan_files: 250,
  max_wiki_prune_files: 25,
  max_wiki_artifact_read_bytes: 256 * 1024,
  min_wiki_trust_score: 0.3,
  prune_wiki_artifacts: false,
  max_from_chat_img_temp_sessions: FROM_CHAT_IMG_TEMP_TRIWIKI_SESSIONS
});

const DURABLE_RETENTION_CLASSES = Object.freeze([
  '.sneakoscope/memory/**',
  '.sneakoscope/wiki/context-pack.json',
  '.sneakoscope/wiki/records/**',
  '.sneakoscope/missions/*/completion-proof.json',
  '.sneakoscope/missions/*/route-completion-contract.json',
  '.sneakoscope/missions/*/evidence-index.json',
  '.sneakoscope/missions/*/trust-report.json',
  '.sneakoscope/missions/*/reflection.md',
  '.sneakoscope/missions/*/reflection-gate.json',
  '.sneakoscope/missions/*/wrongness-*',
  '.sneakoscope/missions/*/image-voxel-ledger.json',
  '.sneakoscope/missions/*/agents/agent-proof-evidence.json',
  '.sneakoscope/missions/*/agents/agent-cleanup*.json',
  '.sneakoscope/missions/*/agents/agent-session-cleanup.json'
]);

const DISPOSABLE_MISSION_DIRS = Object.freeze([
  'team-inbox',
  'bus',
  'tmp',
  'cycles',
  'arenas',
  'agents/lanes',
  'agents/tmp',
  'agents/worktrees',
  'research/cycles',
  'research/tmp'
]);

const DISPOSABLE_MISSION_FILES = Object.freeze([
  'agents/agent-intelligent-work-graph.json',
  'agents/agent-intelligent-work-graph-v2.json'
]);

const MISSION_CLOSE_GATES = Object.freeze([
  'team-gate.json',
  'reflection-gate.json',
  'research-gate.json',
  'qa-gate.json',
  'ppt-gate.json',
  'image-ux-review-gate.json',
  'computer-use-gate.json',
  'gx-gate.json',
  'db-safety-gate.json',
  'goal-gate.json',
  'dfix-gate.json'
]);

const DISPOSABLE_LOG_RE = /\.(?:stdout|stderr)\.log$/;
const RELEASE_PARALLEL_REPORT = 'release-parallel-report.json';

export async function ensureRetentionPolicy(root: any) {
  const p = path.join(root, '.sneakoscope', 'policy.json');
  if (!(await exists(p))) await writeJsonAtomic(p, { retention: DEFAULT_RETENTION_POLICY });
  return p;
}

export async function loadRetentionPolicy(root: any) {
  const p = path.join(root, '.sneakoscope', 'policy.json');
  const data = await readJson(p, {});
  return { ...DEFAULT_RETENTION_POLICY, ...(data.retention || data || {}) };
}

export async function storageReport(root: any): Promise<any> {
  const sks = path.join(root, '.sneakoscope');
  const report: any = { root, exists: await exists(sks), generated_at: nowIso(), sections: {}, total_bytes: 0 };
  if (!report.exists) return report;
  for (const name of ['missions', 'memory', 'gx', 'hproof', 'tmp', 'arenas', 'state', 'model', 'genome', 'trajectories', 'locks', 'reports', 'wiki']) {
    const p = path.join(sks, name);
    const bytes = await dirSize(p).catch(() => 0);
    report.sections[name] = { bytes, human: formatBytes(bytes) };
    report.total_bytes += bytes;
  }
  report.total_human = formatBytes(report.total_bytes);
  return report;
}

async function lightweightStorageReport(root: any): Promise<any> {
  const sks = path.join(root, '.sneakoscope');
  const report: any = {
    root,
    exists: await exists(sks),
    generated_at: nowIso(),
    lightweight: true,
    sections: {},
    total_bytes: null,
    total_human: null
  };
  if (!report.exists) return report;
  for (const name of ['missions', 'memory', 'gx', 'hproof', 'tmp', 'arenas', 'state', 'model', 'genome', 'trajectories', 'locks', 'reports', 'wiki']) {
    const p = path.join(sks, name);
    report.sections[name] = { exists: await exists(p), bytes: null, human: null };
  }
  return report;
}

async function listMissionDirs(root: any, opts: any = {}) {
  const base = path.join(root, '.sneakoscope', 'missions');
  if (!(await exists(base))) return [];
  const entries = await fs.readdir(base, { withFileTypes: true });
  const out: any[] = [];
  const includeSize = Boolean(opts.includeSize);
  for (const e of entries) {
    if (!e.isDirectory() || !e.name.startsWith('M-')) continue;
    const p = path.join(base, e.name);
    const st = await fs.stat(p).catch(() => null);
    if (st) out.push({ id: e.name, path: p, mtimeMs: st.mtimeMs, size: includeSize ? await dirSize(p).catch(() => 0) : null });
  }
  return out.sort((a: any, b: any) => b.mtimeMs - a.mtimeMs);
}

async function missionDirById(root: any, id: any) {
  if (!id) return null;
  const p = path.join(root, '.sneakoscope', 'missions', String(id));
  const st = await fs.stat(p).catch(() => null);
  if (!st?.isDirectory()) return null;
  return { id: String(id), path: p, mtimeMs: st.mtimeMs, size: null };
}

async function pruneTmp(root: any, policy: any, dryRun: any, actions: any) {
  const tmp = path.join(root, '.sneakoscope', 'tmp');
  if (!(await exists(tmp))) return;
  const now = Date.now();
  const maxAge = Math.max(0, Number(policy.max_tmp_age_hours) || 0) * 60 * 60 * 1000;
  const entries = await fs.readdir(tmp, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const p = path.join(tmp, e.name);
    const st = await fs.stat(p).catch(() => null);
    if (!st) continue;
    if (now - st.mtimeMs > maxAge) {
      actions.push({ action: 'remove_tmp', path: p, bytes: e.isDirectory() ? await dirSize(p).catch(() => 0) : st.size });
      if (!dryRun) await rmrf(p);
    }
  }
}

async function activeMissionId(root: any) {
  const current = await readJson(path.join(root, '.sneakoscope', 'state', 'current.json'), null).catch(() => null);
  return current?.mission_id || current?.missionId || current?.mission?.id || null;
}

function gatePassed(gate: any) {
  return Boolean(gate?.passed === true || gate?.ok === true || gate?.status === 'pass' || gate?.status === 'passed');
}

function proofClosed(proof: any) {
  const status = String(proof?.status || '');
  if (['blocked', 'failed', 'not_verified'].includes(status)) return false;
  if (Array.isArray(proof?.blockers) && proof.blockers.length) return false;
  return ['verified', 'verified_partial', 'pass', 'passed'].includes(status);
}

async function missionClosed(mission: any, opts: any = {}) {
  const proof = await readJson(path.join(mission.path, 'completion-proof.json'), null).catch(() => null);
  if (opts.completedMissionId && mission.id === opts.completedMissionId) return proofClosed(proof);
  if (proofClosed(proof)) return true;
  const cleanup = await readJson(path.join(mission.path, 'team-session-cleanup.json'), null).catch(() => null);
  for (const gateFile of MISSION_CLOSE_GATES) {
    const gate = await readJson(path.join(mission.path, gateFile), null).catch(() => null);
    if (!gatePassed(gate)) continue;
    if (gateFile === 'team-gate.json') {
      if (gatePassed(cleanup) || cleanup?.all_sessions_closed === true || cleanup?.status === 'clean') return true;
      continue;
    }
    return true;
  }
  return false;
}

async function removePath(action: string, target: string, dryRun: boolean, actions: any[], extra: any = {}) {
  const st = await fs.stat(target).catch(() => null);
  if (!st) return false;
  const bytes = st.isDirectory() ? await dirSize(target).catch(() => 0) : st.size;
  actions.push({ action, path: target, bytes, ...extra });
  if (!dryRun) await rmrf(target);
  return true;
}

function missionRelative(mission: any, file: string) {
  return path.relative(mission.path, file).split(path.sep).join('/');
}

function isPreservedSessionPath(rel: string) {
  return rel.startsWith('sessions/') || rel.startsWith('agents/sessions/');
}

async function pruneMissionDisposableLogs(mission: any, dryRun: boolean, actions: any[]) {
  const files = await listFilesRecursive(mission.path, { ignore: [], maxFiles: 10000, maxDepth: 8 }).catch(() => []);
  for (const file of files) {
    const rel = missionRelative(mission, file);
    if (isPreservedSessionPath(rel)) continue;
    if (!DISPOSABLE_LOG_RE.test(rel)) continue;
    await removePath('remove_closed_mission_raw_log', file, dryRun, actions, { mission: mission.id, reason: 'closed_mission_disposable_log' });
  }
}

async function compactClosedMissionWorkdirs(root: any, policy: any, dryRun: boolean, actions: any[], opts: any = {}) {
  if (policy.compact_closed_mission_workdirs === false || opts.compactClosedMissionWorkdirs === false) return;
  const activeId = await activeMissionId(root);
  const targetOnly = Boolean(opts.targetMissionOnly || (opts.afterRoute && opts.completedMissionId && opts.sweepClosedMissions !== true));
  const missions = targetOnly
    ? [await missionDirById(root, opts.completedMissionId)]
    : await listMissionDirs(root);
  for (const mission of missions.filter(Boolean)) {
    if (activeId && mission.id === activeId && !(await canCompactActiveMission(mission, opts))) continue;
    if (!(await missionClosed(mission, opts))) continue;
    for (const rel of DISPOSABLE_MISSION_DIRS) {
      const target = path.join(mission.path, rel);
      await removePath('remove_closed_mission_workdir', target, dryRun, actions, { mission: mission.id, rel, reason: 'closed_mission_disposable_workdir' });
    }
    for (const rel of DISPOSABLE_MISSION_FILES) {
      await removePath('remove_closed_mission_large_file', path.join(mission.path, rel), dryRun, actions, { mission: mission.id, rel, reason: 'closed_mission_disposable_large_file' });
    }
    await pruneMissionDisposableLogs(mission, dryRun, actions);
  }
}

async function hasDurableMissionArtifacts(mission: any) {
  for (const rel of [
    'completion-proof.json',
    'completion-proof.md',
    'route-completion-contract.json',
    'evidence-index.json',
    'trust-report.json',
    'trust-report.md',
    'reflection.md',
    'reflection-gate.json',
    'wrongness-ledger.json',
    'wrongness-summary.md',
    'image-voxel-ledger.json',
    'agents/agent-proof-evidence.json',
    'agents/agent-cleanup.json',
    'agents/agent-session-cleanup.json',
    'agents/agent-cleanup-proof.json'
  ]) {
    if (await exists(path.join(mission.path, rel))) return true;
  }
  return false;
}

async function compactOldMissionWithDurableArtifacts(mission: any, dryRun: boolean, actions: any[], reason: string) {
  actions.push({
    action: 'retain_mission_durable_context',
    mission: mission.id,
    path: mission.path,
    bytes: mission.size ?? null,
    reason
  });
  for (const rel of DISPOSABLE_MISSION_DIRS) {
    await removePath('remove_old_mission_workdir', path.join(mission.path, rel), dryRun, actions, { mission: mission.id, rel, reason });
  }
  for (const rel of DISPOSABLE_MISSION_FILES) {
    await removePath('remove_old_mission_large_file', path.join(mission.path, rel), dryRun, actions, { mission: mission.id, rel, reason });
  }
  await pruneMissionDisposableLogs(mission, dryRun, actions);
}

async function canCompactActiveMission(mission: any, opts: any = {}) {
  if (opts.allowActiveMissionCleanup === true) return true;
  const reflection = await readJson(path.join(mission.path, 'reflection-gate.json'), null).catch(() => null);
  return gatePassed(reflection);
}

async function releaseReportReferencesLogDir(root: any, logDir: string) {
  const report = await readJson(path.join(root, '.sneakoscope', 'reports', RELEASE_PARALLEL_REPORT), null).catch(() => null);
  if (!Array.isArray(report?.results)) return false;
  const prefix = `${path.resolve(logDir)}${path.sep}`;
  return report.results.some((row: any) => {
    const stdout = row?.stdout_log ? path.resolve(String(row.stdout_log)) : '';
    const stderr = row?.stderr_log ? path.resolve(String(row.stderr_log)) : '';
    return (stdout && stdout.startsWith(prefix)) || (stderr && stderr.startsWith(prefix));
  });
}

async function pruneDisposableReportLogs(root: any, policy: any, dryRun: boolean, actions: any[], opts: any = {}) {
  if (!(opts.pruneReportLogs || policy.prune_disposable_report_logs)) return;
  const reports = path.join(root, '.sneakoscope', 'reports');
  if (!(await exists(reports))) return;
  const releaseLogDir = path.join(reports, 'release-parallel-logs');
  if (await exists(releaseLogDir)) {
    if (await releaseReportReferencesLogDir(root, releaseLogDir)) {
      actions.push({ action: 'skip_disposable_report_log_dir', path: releaseLogDir, reason: 'release_parallel_report_still_references_logs' });
    } else {
      await removePath('remove_disposable_report_log_dir', releaseLogDir, dryRun, actions, { reason: 'summarized_release_parallel_logs' });
    }
  }
  const files = await listFilesRecursive(reports, { ignore: [], maxFiles: 20000, maxDepth: 8 }).catch(() => []);
  for (const file of files) {
    if (!DISPOSABLE_LOG_RE.test(file)) continue;
    await removePath('remove_disposable_report_log', file, dryRun, actions, { reason: 'summarized_report_log' });
  }
}

async function pruneOldMissions(root: any, policy: any, dryRun: any, actions: any) {
  if (policy.prune_old_missions === false) return;
  const missions = await listMissionDirs(root);
  const activeId = await activeMissionId(root);
  const now = Date.now();
  const maxAge = policy.max_mission_age_days * 24 * 60 * 60 * 1000;
  for (let i = 0; i < missions.length; i++) {
    const m = missions[i];
    if (activeId && m.id === activeId) continue;
    const tooMany = i >= policy.max_missions;
    const tooOld = now - m.mtimeMs > maxAge;
    if (tooMany || tooOld) {
      const reason = tooMany ? 'max_missions' : 'max_age';
      if (await hasDurableMissionArtifacts(m)) {
        if (await missionClosed(m)) {
          await compactOldMissionWithDurableArtifacts(m, dryRun, actions, reason);
        } else {
          actions.push({
            action: 'retain_mission_durable_context',
            mission: m.id,
            path: m.path,
            bytes: m.size ?? null,
            reason: `${reason}_diagnostics_not_closed`
          });
        }
      } else {
        actions.push({ action: 'remove_mission', mission: m.id, path: m.path, bytes: m.size ?? null, reason });
        if (!dryRun) await rmrf(m.path);
      }
    }
  }
}

async function pruneFromChatImgTempTriWiki(root: any, policy: any, dryRun: any, actions: any) {
  const missions = await listMissionDirs(root);
  const ttlDefault = Math.max(1, Number(policy.max_from_chat_img_temp_sessions) || FROM_CHAT_IMG_TEMP_TRIWIKI_SESSIONS);
  for (let i = 0; i < missions.length; i++) {
    const m = missions[i];
    const file = path.join(m.path, FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT);
    if (!(await exists(file))) continue;
    const data = await readJson(file, {});
    const ttl = Math.max(1, Math.min(ttlDefault, Number(data.expires_after_sessions) || ttlDefault));
    if (i < ttl) continue;
    const bytes = await fileSize(file).catch(() => 0);
    actions.push({ action: 'remove_from_chat_img_temp_triwiki', mission: m.id, path: file, bytes, reason: 'session_ttl', expires_after_sessions: ttl });
    if (!dryRun) await rmrf(file);
  }
}

async function compactMission(mission: any, policy: any, dryRun: any, actions: any) {
  if (mission.size == null) mission.size = await dirSize(mission.path).catch(() => 0);
  if (mission.size <= policy.max_mission_bytes) return;
  const cyclesRoot = path.join(mission.path, 'cycles');
  if (await exists(cyclesRoot)) {
    const entries = await fs.readdir(cyclesRoot, { withFileTypes: true }).catch(() => []);
    const dirs: any[] = [];
    for (const e of entries) {
      if (!e.isDirectory() || !/^cycle-\d+$/.test(e.name)) continue;
      const n = Number(e.name.replace('cycle-', ''));
      const p = path.join(cyclesRoot, e.name);
      dirs.push({ n, path: p, bytes: await dirSize(p).catch(() => 0) });
    }
    dirs.sort((a: any, b: any) => b.n - a.n);
    for (const d of dirs.slice(policy.keep_last_cycles_per_mission)) {
      actions.push({ action: 'remove_old_cycle_dir', mission: mission.id, path: d.path, bytes: d.bytes });
      if (!dryRun) await rmrf(d.path);
    }
  }
  const arena = path.join(mission.path, 'arenas');
  if (await exists(arena)) {
    const bytes = await dirSize(arena).catch(() => 0);
    if (bytes > 0) {
      actions.push({ action: 'remove_mission_arenas', mission: mission.id, path: arena, bytes });
      if (!dryRun) await rmrf(arena);
    }
  }
}

async function rotateLargeJsonl(root: any, policy: any, dryRun: any, actions: any) {
  const files = await listFilesRecursive(path.join(root, '.sneakoscope'), { maxFiles: 100000 }).catch(() => []);
  for (const f of files) {
    if (!f.endsWith('.jsonl')) continue;
    const size = await fileSize(f);
    if (size <= policy.max_event_log_bytes) continue;
    actions.push({ action: 'rotate_jsonl', path: f, bytes: size, keep_bytes: Math.floor(policy.max_event_log_bytes / 2) });
    if (!dryRun) await appendJsonlBounded(f, { ts: nowIso(), type: 'gc.rotate_requested' }, policy.max_event_log_bytes);
  }
}

function wikiTrustScore(data: any = {}) {
  const summaryAvg = Number(data.trust_summary?.avg);
  if (Number.isFinite(summaryAvg)) return summaryAvg;
  const wiki = data.wiki || data;
  const scores: any[] = [];
  if (Array.isArray(wiki.anchors)) {
    for (const anchor of wiki.anchors) {
      const score = Number(anchor?.trust_score);
      if (Number.isFinite(score)) scores.push(score);
    }
  }
  if (Array.isArray(wiki.a)) {
    for (const row of wiki.a) {
      const score = Number(row?.[9]);
      if (Number.isFinite(score)) scores.push(score);
    }
  }
  if (!scores.length) return null;
  return scores.reduce((sum: any, score: any) => sum + score, 0) / scores.length;
}

async function wikiArtifactTrust(file: any, maxReadBytes: any) {
  const size = await fileSize(file).catch(() => 0);
  if (!size || size > maxReadBytes) return null;
  try {
    return wikiTrustScore(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch {
    return null;
  }
}

export async function pruneWikiArtifacts(root: any, opts: any = {}) {
  const policy = { ...(await loadRetentionPolicy(root)), ...(opts.policy || {}) };
  const dryRun = Boolean(opts.dryRun);
  const actions = opts.actions || [];
  const wikiDir = path.join(root, '.sneakoscope', 'wiki');
  if (!(await exists(wikiDir))) return { dryRun, policy, actions, scanned: 0, candidates: 0 };
  const files = (await listFilesRecursive(wikiDir, { maxFiles: Number(policy.max_wiki_scan_files) || 250 }).catch(() => []))
    .filter((file: any) => path.extname(file) === '.json');
  const keep = new Set([
    path.join(wikiDir, 'context-pack.json')
  ]);
  const keepDirs = [
    path.join(wikiDir, 'records') + path.sep,
    path.join(wikiDir, 'wrongness') + path.sep,
    path.join(wikiDir, 'image-voxels') + path.sep,
    path.join(wikiDir, 'avoidance-rules') + path.sep
  ];
  const entries: any[] = [];
  for (const file of files) {
    const st = await fs.stat(file).catch(() => null);
    if (!st || keep.has(file) || keepDirs.some((dir) => path.resolve(file).startsWith(dir))) continue;
    entries.push({ path: file, mtimeMs: st.mtimeMs, bytes: st.size });
  }
  entries.sort((a: any, b: any) => b.mtimeMs - a.mtimeMs);
  const now = Date.now();
  const maxAge = Number(policy.max_wiki_artifact_age_days) * 24 * 60 * 60 * 1000;
  const maxArtifacts = Math.max(0, Number(policy.max_wiki_artifacts) || 0);
  const minTrust = Number(policy.min_wiki_trust_score);
  const maxReadBytes = Math.max(1024, Number(policy.max_wiki_artifact_read_bytes) || 256 * 1024);
  const maxPrune = Math.max(0, Number(policy.max_wiki_prune_files) || 0);
  let candidates = 0;
  for (let i = 0; i < entries.length; i++) {
    if (candidates >= maxPrune) break;
    const entry = entries[i];
    const tooMany = maxArtifacts > 0 && i >= maxArtifacts;
    const tooOld = Number.isFinite(maxAge) && maxAge > 0 && now - entry.mtimeMs > maxAge;
    const trustScore = opts.lowTrust === false || !Number.isFinite(minTrust)
      ? null
      : await wikiArtifactTrust(entry.path, maxReadBytes);
    const lowTrust = trustScore != null && trustScore < minTrust;
    const reason = tooMany ? 'max_wiki_artifacts' : (tooOld ? 'max_wiki_artifact_age' : (lowTrust ? 'low_wiki_trust' : null));
    if (!reason) continue;
    candidates += 1;
    actions.push({
      action: 'remove_wiki_artifact',
      path: entry.path,
      bytes: entry.bytes,
      reason,
      ...(trustScore != null ? { trust_score: Number(trustScore.toFixed(4)) } : {})
    });
    if (!dryRun) await rmrf(entry.path);
  }
  return { dryRun, policy, actions, scanned: entries.length, candidates };
}

export async function enforceRetention(root: any, opts: any = {}) {
  const policy = { ...(await loadRetentionPolicy(root)), ...(opts.policy || {}) };
  const dryRun = Boolean(opts.dryRun);
  const actions: any[] = [];
  const boundedMode = Boolean(opts.lightweight || opts.afterRoute || opts.afterReleaseCheck);
  const fullMissionSweep = opts.fullMissionSweep ?? !boundedMode;
  const shouldCompactClosedMissions = opts.compactClosedMissionWorkdirs === true
    || (fullMissionSweep && policy.compact_closed_mission_workdirs !== false)
    || Boolean(opts.afterRoute && opts.completedMissionId);
  await ensureDir(path.join(root, '.sneakoscope', 'reports'));
  await pruneTmp(root, policy, dryRun, actions);
  if (fullMissionSweep) await pruneOldMissions(root, policy, dryRun, actions);
  if (fullMissionSweep) await pruneFromChatImgTempTriWiki(root, policy, dryRun, actions);
  if (opts.compactOversizeMissions === true || policy.compact_oversize_missions === true) {
    for (const m of await listMissionDirs(root, { includeSize: true })) await compactMission(m, policy, dryRun, actions);
  }
  if (shouldCompactClosedMissions) await compactClosedMissionWorkdirs(root, policy, dryRun, actions, opts);
  if (fullMissionSweep || opts.rotateLargeJsonl === true) await rotateLargeJsonl(root, policy, dryRun, actions);
  await pruneDisposableReportLogs(root, policy, dryRun, actions, opts);
  if (opts.pruneWikiArtifacts || policy.prune_wiki_artifacts) await pruneWikiArtifacts(root, { policy, dryRun, actions, lowTrust: opts.pruneWikiLowTrust });
  const report = boundedMode || opts.skipStorageReport === true ? await lightweightStorageReport(root) : await storageReport(root);
  const cleanup = {
    schema: 'sks.retention-cleanup.v1',
    generated_at: nowIso(),
    mode: opts.mode || (opts.afterRoute ? 'post_route' : (opts.afterReleaseCheck ? 'post_release_check' : 'gc')),
    dry_run: dryRun,
    bounded: boundedMode,
    full_mission_sweep: Boolean(fullMissionSweep),
    action_count: actions.length,
    protected_durable_context: DURABLE_RETENTION_CLASSES,
    disposable_mission_dirs: DISPOSABLE_MISSION_DIRS,
    disposable_mission_files: DISPOSABLE_MISSION_FILES,
    prune_report_logs: Boolean(opts.pruneReportLogs || policy.prune_disposable_report_logs),
    completed_mission_id: opts.completedMissionId || null,
    actions
  };
  if (!dryRun) await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'storage.json'), report);
  if (!dryRun) await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'retention-cleanup.json'), cleanup);
  return { dryRun, policy, actions, report, cleanup };
}
