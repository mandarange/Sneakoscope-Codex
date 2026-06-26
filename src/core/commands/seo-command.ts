import path from 'node:path';
import { printJson } from '../../cli/output.js';
import { projectRoot } from '../fsx.js';
import { flag, readOption } from './command-utils.js';
import {
  runSearchVisibilityApply,
  runSearchVisibilityAudit,
  runSearchVisibilityDoctor,
  runSearchVisibilityFixture,
  runSearchVisibilityPlan,
  runSearchVisibilityRollback,
  runSearchVisibilityStatus,
  runSearchVisibilityVerify,
} from '../search-visibility/index.js';
import type { SearchVisibilityCliOptions, SearchVisibilityFramework, SearchVisibilityTarget } from '../search-visibility/types.js';

export async function seoCommand(args: string[] = []) {
  return runSearchVisibilityCommand('seo', args, 'seo');
}

export async function seoGeoOptimizerCommand(args: string[] = []) {
  const normalized = normalizeOptimizerArgs(args);
  return runSearchVisibilityCommand(normalized.mode, normalized.args, 'seo-geo-optimizer');
}

export async function runSearchVisibilityCommand(mode: 'seo' | 'geo', args: string[] = [], displayCommand: 'seo' | 'geo' | 'seo-geo-optimizer' = mode) {
  const action = args[0] || 'doctor';
  const rest = args.slice(1);
  const options = await parseOptions(rest);
  let result: unknown;
  if (action === 'doctor') result = await runSearchVisibilityDoctor(mode, options);
  else if (action === 'audit') result = await runSearchVisibilityAudit(mode, options);
  else if (action === 'plan') result = await runSearchVisibilityPlan(mode, firstPositional(rest) || 'latest', options);
  else if (action === 'apply') result = await runSearchVisibilityApply(mode, firstPositional(rest) || 'latest', options);
  else if (action === 'verify') result = await runSearchVisibilityVerify(mode, firstPositional(rest) || 'latest', options);
  else if (action === 'status') result = await runSearchVisibilityStatus(mode, firstPositional(rest) || 'latest', options);
  else if (action === 'rollback') result = await runSearchVisibilityRollback(mode, firstPositional(rest) || 'latest', options);
  else if (action === 'fixture') result = await runSearchVisibilityFixture(mode, options);
  else return usage(mode, 2, displayCommand);
  if (isBlocked(result)) process.exitCode = 1;
  if (options.json) {
    printJson(result);
    return result;
  }
  printHuman(mode, action, result);
  return result;
}

function normalizeOptimizerArgs(args: string[]): { mode: 'seo' | 'geo'; args: string[] } {
  const out = [...args];
  const first = String(out[0] || '').toLowerCase();
  if (first === 'seo' || first === 'geo') return { mode: first, args: out.slice(1) };
  const modeIndex = out.findIndex((item) => item === '--mode');
  if (modeIndex >= 0) {
    const value = String(out[modeIndex + 1] || '').toLowerCase();
    out.splice(modeIndex, value ? 2 : 1);
    return { mode: value === 'geo' ? 'geo' : 'seo', args: out };
  }
  if (out.includes('--include-llms-txt') || out.includes('--observe-queries') || out.includes('--query-file')) return { mode: 'geo', args: out };
  return { mode: 'seo', args: out };
}

async function parseOptions(args: string[]): Promise<SearchVisibilityCliOptions> {
  const root = path.resolve(readOption(args, '--root', await projectRoot()));
  return {
    root,
    url: readOption(args, '--url', null),
    target: targetOption(readOption(args, '--target', 'auto')),
    framework: frameworkOption(readOption(args, '--framework', 'auto')),
    offline: flag(args, '--offline'),
    strict: flag(args, '--strict'),
    json: flag(args, '--json'),
    apply: flag(args, '--apply'),
    yes: flag(args, '--yes'),
    allowDirtyTouched: flag(args, '--allow-dirty-touched'),
    browser: flag(args, '--browser'),
    includeLlmsTxt: flag(args, '--include-llms-txt'),
    observeQueries: flag(args, '--observe-queries'),
    queryFile: readOption(args, '--query-file', null),
    scope: String(readOption(args, '--scope', '') || '').split(',').map((item) => item.trim()).filter(Boolean),
  };
}

function targetOption(value: string): SearchVisibilityTarget {
  return ['auto', 'website', 'docs', 'package'].includes(value) ? value as SearchVisibilityTarget : 'auto';
}

function frameworkOption(value: string): SearchVisibilityFramework {
  return ['auto', 'next-app', 'next-pages', 'static', 'package', 'unsupported'].includes(value) ? value as SearchVisibilityFramework : 'auto';
}

function firstPositional(args: string[]): string | null {
  const valueFlags = new Set(['--root', '--url', '--target', '--framework', '--scope', '--query-file']);
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i] || '';
    if (valueFlags.has(value)) {
      i += 1;
      continue;
    }
    if (!value.startsWith('--')) return value;
  }
  return null;
}

function usage(mode: 'seo' | 'geo', exitCode: number, displayCommand: 'seo' | 'geo' | 'seo-geo-optimizer' = mode) {
  if (displayCommand === 'seo-geo-optimizer') {
    console.error('Usage: sks seo-geo-optimizer [seo|geo] doctor|audit|plan|apply|verify|status|rollback|fixture [mission|latest] [--mode seo|geo] [--root <path>] [--url <origin>] [--target auto|website|docs|package] [--framework auto|next-app|next-pages|static] [--offline] [--strict] [--json]');
    console.error('       sks seo-geo-optimizer apply <mission|latest> --mode seo|geo --apply [--include-llms-txt] [--scope <rule-or-path,...>] [--yes] [--json]');
    console.error('       sks seo-geo-optimizer rollback <mission|latest> --mode seo|geo --apply [--yes] [--json]');
    process.exitCode = exitCode;
    return { schema: 'sks.search-visibility.usage.v1', ok: false, status: 'blocked', mode, command: displayCommand, reason: 'invalid_subcommand' };
  }
  const applyFlag = mode === 'geo' ? ' [--include-llms-txt]' : '';
  console.error(`Usage: sks ${mode} doctor|audit|plan|apply|verify|status|rollback|fixture [mission|latest] [--root <path>] [--url <origin>] [--target auto|website|docs|package] [--framework auto|next-app|next-pages|static] [--offline] [--strict] [--json]`);
  console.error(`       sks ${mode} apply <mission|latest> --apply${applyFlag} [--scope <rule-or-path,...>] [--yes] [--json]`);
  console.error(`       sks ${mode} rollback <mission|latest> --apply [--yes] [--json]`);
  process.exitCode = exitCode;
  return { schema: 'sks.search-visibility.usage.v1', ok: false, status: 'blocked', mode, reason: 'invalid_subcommand' };
}

function isBlocked(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const rec = value as { ok?: unknown; status?: unknown };
  return rec.ok === false || rec.status === 'blocked';
}

function printHuman(mode: 'seo' | 'geo', action: string, value: unknown) {
  const rec = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  console.log(`SKS ${mode.toUpperCase()} ${action}: ${rec.status || (rec.ok === false ? 'blocked' : 'ok')}`);
  if (rec.mission_id) console.log(`Mission: ${rec.mission_id}`);
  if (rec.artifacts_dir) console.log(`Artifacts: ${rec.artifacts_dir}`);
  if (Array.isArray(rec.blockers) && rec.blockers.length) console.log(`Blockers: ${rec.blockers.join(', ')}`);
}
