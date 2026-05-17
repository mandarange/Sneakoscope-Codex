import path from 'node:path';
import { appendJsonl, ensureDir, nowIso, readJson, writeJsonAtomic, writeTextAtomic } from '../fsx.mjs';
import { missionDir } from '../mission.mjs';
import { SCOUT_ALL_OUTPUTS, SCOUT_PERFORMANCE_SUMMARY_SCHEMA } from './scout-schema.mjs';

export function scoutMissionDir(root, missionId) {
  return missionDir(root, missionId);
}

export function scoutArtifactPath(root, missionId, file) {
  return path.join(scoutMissionDir(root, missionId), file);
}

export function scoutArtifactRel(missionId, file) {
  return `.sneakoscope/missions/${missionId}/${file}`;
}

export async function resetScoutLedger(root, missionId) {
  await writeTextAtomic(scoutArtifactPath(root, missionId, 'scout-parallel-ledger.jsonl'), '');
}

export async function appendScoutLedger(root, missionId, event = {}) {
  await appendJsonl(scoutArtifactPath(root, missionId, 'scout-parallel-ledger.jsonl'), {
    ts: nowIso(),
    ...event
  });
}

export function renderScoutMarkdown(result = {}) {
  const lines = [
    `# ${result.role || result.scout_id || 'Scout Result'}`,
    '',
    `Mission: ${result.mission_id || 'unknown'}`,
    `Route: ${result.route || 'unknown'}`,
    `Status: ${result.status || 'unknown'}`,
    `Read-only: ${result.read_only === true ? 'true' : 'false'}`,
    '',
    '## Summary',
    '',
    result.summary || 'No summary recorded.',
    '',
    '## Findings',
    ''
  ];
  const findings = result.findings?.length ? result.findings : [];
  for (const finding of findings) {
    lines.push(`- ${finding.id}: ${finding.claim}`);
    if (finding.action) lines.push(`  Action: ${finding.action}`);
  }
  lines.push('', '## Suggested Tasks', '');
  for (const task of result.suggested_tasks || []) {
    lines.push(`- ${task.id}: ${task.title}`);
    if (task.files?.length) lines.push(`  Files: ${task.files.join(', ')}`);
    if (task.verification?.length) lines.push(`  Verification: ${task.verification.join(', ')}`);
  }
  if (result.blockers?.length) {
    lines.push('', '## Blockers', '');
    for (const blocker of result.blockers) lines.push(`- ${blocker}`);
  }
  if (result.unverified?.length) {
    lines.push('', '## Unverified', '');
    for (const item of result.unverified) lines.push(`- ${item}`);
  }
  return `${lines.join('\n')}\n`;
}

export async function writeScoutPerformanceSummary(root, performance = {}) {
  const reportsDir = path.join(root, '.sneakoscope', 'reports');
  await ensureDir(reportsDir);
  const file = path.join(reportsDir, 'scout-performance-summary.json');
  const previous = await readJson(file, null);
  const history = Array.isArray(previous?.recent) ? previous.recent.slice(-19) : [];
  history.push({
    mission_id: performance.mission_id || null,
    route: performance.route || null,
    parallel_mode: performance.parallel_mode || null,
    scout_count: performance.scout_count || null,
    duration_ms: performance.duration_ms || null,
    claim_allowed: performance.claim_allowed === true,
    completed_at: performance.completed_at || nowIso()
  });
  const summary = {
    schema: SCOUT_PERFORMANCE_SUMMARY_SCHEMA,
    updated_at: nowIso(),
    total_recorded: Number(previous?.total_recorded || 0) + 1,
    latest: history.at(-1),
    recent: history
  };
  await writeJsonAtomic(file, summary);
  return summary;
}

export function scoutArtifactList() {
  return [...SCOUT_ALL_OUTPUTS];
}
