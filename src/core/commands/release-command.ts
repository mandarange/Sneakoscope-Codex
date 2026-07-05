import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { flag } from '../../cli/args.js';
import { printJson } from '../../cli/output.js';
import { exists, projectRoot, readJson, writeJsonAtomic, writeTextAtomic } from '../fsx.js';
import { createMission } from '../mission.js';

export async function releaseCommand(args: string[] = []): Promise<unknown> {
  const root = await projectRoot();
  const sub = args[0] && !args[0].startsWith('-') ? args[0] : 'affected';
  const json = flag(args, '--json');
  const command = commandForSubcommand(sub);
  if (!command) {
    console.error('Usage: sks release affected|full|background [--json]');
    process.exitCode = 1;
    return null;
  }
  const mission = await createMission(root, { mode: 'release-review', prompt: `Release review ${sub}` });
  const result = spawnSync(process.execPath, command.args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
    env: { ...process.env, CI: process.env.CI || 'true' }
  });
  const stdoutPath = path.join(mission.dir, 'release-command-stdout.log');
  const stderrPath = path.join(mission.dir, 'release-command-stderr.log');
  await writeTextAtomic(stdoutPath, String(result.stdout || ''));
  await writeTextAtomic(stderrPath, String(result.stderr || ''));
  const readiness = await findReleaseReadinessReport(root);
  const requiredSections: string[] = [];
  const missingSections = requiredSections.filter((section) => readiness.report?.[section] == null);
  if (readiness.report) await writeJsonAtomic(path.join(mission.dir, 'release-readiness-report.json'), readiness.report);
  const report = {
    schema: 'sks.release-command.v1',
    ok: result.status === 0 && readiness.valid === true && missingSections.length === 0,
    subcommand: sub,
    mission_id: mission.id,
    command: [process.execPath, ...command.args],
    status: result.status,
    release_report: readiness.path,
    release_report_valid: readiness.valid,
    missing_sections: missingSections,
    blockers: [
      ...(result.status === 0 ? [] : ['release_subprocess_failed']),
      ...(readiness.valid ? [] : ['release_report_missing_or_invalid']),
      ...missingSections.map((section) => `release_report_missing_section:${section}`)
    ],
    logs: {
      stdout: path.relative(root, stdoutPath),
      stderr: path.relative(root, stderrPath)
    },
    stdout_tail: tail(String(result.stdout || '')),
    stderr_tail: tail(String(result.stderr || ''))
  };
  if (!report.ok) process.exitCode = result.status || 1;
  if (json) return printJson(report);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return report;
}

async function findReleaseReadinessReport(root: string) {
  const candidates = [
    path.join(root, 'release-readiness-report.json'),
    path.join(root, '.sneakoscope', 'reports', 'release-readiness-report.json')
  ];
  const reportsDir = path.join(root, '.sneakoscope', 'reports');
  const entries = await fsp.readdir(reportsDir).catch(() => []);
  for (const entry of entries) {
    if (/^release-readiness.*\.json$/.test(entry)) candidates.push(path.join(reportsDir, entry));
  }
  const existing = [];
  for (const candidate of candidates) {
    if (await exists(candidate)) {
      const stat = await fsp.stat(candidate).catch(() => null);
      existing.push({ path: candidate, mtime: stat?.mtimeMs || 0 });
    }
  }
  existing.sort((a, b) => b.mtime - a.mtime);
  const selected = existing[0]?.path || null;
  const report = selected ? await readJson(selected, null) : null;
  return {
    path: selected ? path.relative(root, selected) : null,
    report,
    valid: Boolean(report && typeof report.schema === 'string' && /release-readiness/.test(report.schema))
  };
}

function commandForSubcommand(sub: string): { args: string[] } | null {
  if (sub === 'affected') return { args: ['dist/scripts/release-gate-dag-runner.js', '--preset', 'affected', '--changed-since', 'auto', '--sla', '5m'] };
  if (sub === 'full') return { args: ['dist/scripts/release-gate-dag-runner.js', '--preset', 'release', '--full'] };
  if (sub === 'background') return { args: ['dist/scripts/release-gate-dag-runner.js', '--preset', 'release', '--full'] };
  return null;
}

function tail(value: string, limit = 4000): string {
  return value.length > limit ? value.slice(-limit) : value;
}
