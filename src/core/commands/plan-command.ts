import path from 'node:path';
import { flag } from '../../cli/args.js';
import { printJson } from '../../cli/output.js';
import { ui } from '../../cli/cli-theme.js';
import { ensureDir, nowIso, projectRoot, writeTextAtomic } from '../fsx.js';

export async function planCommand(args: string[] = []) {
  const root = path.resolve(String(readOption(args, '--root', '') || await projectRoot()));
  const prompt = positional(args).join(' ').trim() || String(readOption(args, '--task', '') || '').trim();
  if (!prompt) {
    console.error('Usage: sks plan "task" [--json]');
    process.exitCode = 2;
    return null;
  }
  const slug = slugify(prompt);
  const file = path.join(root, '.sneakoscope', 'plans', `${slug}.md`);
  await ensureDir(path.dirname(file));
  const text = [
    `# SKS Plan: ${prompt}`,
    ``,
    `Generated: ${nowIso()}`,
    `Implementation Allowed: false`,
    ``,
    `## Goal`,
    `- ${prompt}`,
    ``,
    `## Scope`,
    `- Inspect the smallest relevant code and docs surface before editing.`,
    `- Preserve existing SKS proof-first gates and lean-engineering policy.`,
    ``,
    `## Implementation Steps`,
    `- Identify exact files and ownership boundaries.`,
    `- Apply the smallest working change.`,
    `- Update focused tests or release checks for changed behavior.`,
    ``,
    `## Acceptance Checks`,
    `- Typecheck or targeted build passes.`,
    `- Relevant SKS gate/report is written and current.`,
    `- Final summary separates verified from unverified work.`,
    ``,
    `## Rollback Plan`,
    `- Revert only files changed for this plan if verification fails.`
  ].join('\n');
  await writeTextAtomic(file, `${text}\n`);
  const result = { schema: 'sks.plan-artifact.v1', ok: true, prompt, file: path.relative(root, file), implementation_allowed: false };
  if (flag(args, '--json')) return printJson(result);
  ui.banner('plan');
  ui.ok(result.file);
  return result;
}

function positional(args: string[]) {
  const out: string[] = [];
  const optionsWithValue = new Set(['--root', '--task']);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] || '';
    if (optionsWithValue.has(arg)) {
      index += 1;
      continue;
    }
    if (!arg.startsWith('--')) out.push(arg);
  }
  return out;
}

function slugify(value: string) {
  const base = value.toLowerCase().replace(/[^a-z0-9가-힣]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return base || `plan-${Date.now().toString(36)}`;
}

function readOption(args: string[] = [], name: string, fallback: unknown = null) {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !String(args[index + 1]).startsWith('--')) return args[index + 1];
  const prefixed = args.find((arg) => String(arg).startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : fallback;
}
