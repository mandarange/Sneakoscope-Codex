import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { exists, writeJsonAtomic } from '../../../fsx.js';

export interface GlmNarutoTargetedCheckRow {
  readonly id: string;
  readonly ok: boolean;
  readonly skipped?: boolean;
  readonly command?: readonly string[];
  readonly path?: string;
  readonly message?: string;
}

export interface GlmNarutoTargetedChecksResult {
  readonly schema: 'sks.glm-naruto-targeted-checks.v1';
  readonly ok: boolean;
  readonly touched_paths: readonly string[];
  readonly checks: readonly GlmNarutoTargetedCheckRow[];
  readonly blockers: readonly string[];
}

export async function runGlmNarutoTargetedChecks(input: {
  readonly cwd: string;
  readonly touchedPaths: readonly string[];
  readonly artifactDir?: string;
  readonly strictChecks?: boolean;
  readonly tscFileThreshold?: number;
}): Promise<GlmNarutoTargetedChecksResult> {
  const checks: GlmNarutoTargetedCheckRow[] = [];
  const touchedPaths = [...new Set(input.touchedPaths)].sort();

  const diffCheck = await runProcess(input.cwd, ['git', 'diff', '--check']);
  checks.push({
    id: 'git_diff_check',
    ok: diffCheck.code === 0,
    command: ['git', 'diff', '--check'],
    ...(diffCheck.code === 0 ? {} : { message: diffCheck.stderr || diffCheck.stdout || 'git diff --check failed' })
  });

  for (const rel of touchedPaths.filter((file) => /\.(?:json)$/i.test(file))) {
    const absolute = path.join(input.cwd, rel);
    try {
      JSON.parse(await fsp.readFile(absolute, 'utf8'));
      checks.push({ id: 'json_parse', ok: true, path: rel });
    } catch (err) {
      checks.push({ id: 'json_parse', ok: false, path: rel, message: err instanceof Error ? err.message : String(err) });
    }
  }

  for (const rel of touchedPaths.filter((file) => /\.(?:js|mjs|cjs)$/i.test(file))) {
    const nodeCheck = await runProcess(input.cwd, ['node', '--check', rel]);
    checks.push({
      id: 'node_check',
      ok: nodeCheck.code === 0,
      path: rel,
      command: ['node', '--check', rel],
      ...(nodeCheck.code === 0 ? {} : { message: nodeCheck.stderr || nodeCheck.stdout || 'node --check failed' })
    });
  }

  const tsTouched = touchedPaths.filter((file) => /\.(?:ts|tsx)$/i.test(file));
  const tscThreshold = input.tscFileThreshold ?? 3;
  if (tsTouched.length > 0 && (input.strictChecks || tsTouched.length <= tscThreshold)) {
    const tscBin = path.join(input.cwd, 'node_modules', '.bin', 'tsc');
    const tsconfig = path.join(input.cwd, 'tsconfig.json');
    if (await exists(tscBin) && await exists(tsconfig)) {
      const tsc = await runProcess(input.cwd, [tscBin, '-p', 'tsconfig.json', '--noEmit']);
      checks.push({
        id: 'tsc_no_emit',
        ok: tsc.code === 0,
        command: [tscBin, '-p', 'tsconfig.json', '--noEmit'],
        ...(tsc.code === 0 ? {} : { message: tsc.stderr || tsc.stdout || 'tsc --noEmit failed' })
      });
    } else {
      checks.push({ id: 'tsc_no_emit', ok: true, skipped: true, message: 'tsc_or_tsconfig_unavailable' });
    }
  }

  const blockers = checks.filter((check) => !check.ok).map((check) => `${check.id}${check.path ? `:${check.path}` : ''}`);
  const result: GlmNarutoTargetedChecksResult = {
    schema: 'sks.glm-naruto-targeted-checks.v1',
    ok: blockers.length === 0,
    touched_paths: touchedPaths,
    checks,
    blockers
  };
  if (input.artifactDir) await writeJsonAtomic(path.join(input.artifactDir, 'targeted-checks.json'), result);
  return result;
}

function runProcess(cwd: string, command: readonly string[]): Promise<{ readonly code: number | null; readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command[0]!, command.slice(1), { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', (err) => resolve({ code: 1, stdout, stderr: err.message }));
  });
}
