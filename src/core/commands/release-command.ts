import { spawnSync } from 'node:child_process';
import { flag } from '../../cli/args.js';
import { printJson } from '../../cli/output.js';
import { projectRoot } from '../fsx.js';

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
  const result = spawnSync(process.execPath, command.args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
    env: { ...process.env, CI: process.env.CI || 'true' }
  });
  const report = {
    schema: 'sks.release-command.v1',
    ok: result.status === 0,
    subcommand: sub,
    command: [process.execPath, ...command.args],
    status: result.status,
    stdout_tail: tail(String(result.stdout || '')),
    stderr_tail: tail(String(result.stderr || ''))
  };
  if (json) return printJson(report);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (!report.ok) process.exitCode = result.status || 1;
  return report;
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
