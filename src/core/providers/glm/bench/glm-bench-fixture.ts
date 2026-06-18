import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { spawn } from 'node:child_process';
import type { GlmBenchFixture } from './glm-benchmark-types.js';

export const BENCH_FIXTURE_TASK = 'Change src/bench-target.ts so value is 2. Return the smallest patch only.';
export const BENCH_FIXTURE_TARGET_FILE = 'src/bench-target.ts';
export const BENCH_FIXTURE_INITIAL = 'export const value = 1;\n';
export const BENCH_FIXTURE_EXPECTED = 'export const value = 2;\n';

export async function createGlmBenchFixture(baseDir?: string): Promise<GlmBenchFixture> {
  const fixtureDir = await fsp.mkdtemp(path.join(baseDir || os.tmpdir(), 'sks-glm-bench-fixture-'));
  await fsp.mkdir(path.join(fixtureDir, 'src'), { recursive: true });
  await fsp.writeFile(path.join(fixtureDir, BENCH_FIXTURE_TARGET_FILE), BENCH_FIXTURE_INITIAL, 'utf8');
  await gitInit(fixtureDir);
  await gitAdd(fixtureDir, '.');
  await gitCommit(fixtureDir, 'bench fixture initial');
  return {
    schema: 'sks.glm-bench-fixture.v1',
    fixture_dir: fixtureDir,
    task: BENCH_FIXTURE_TASK,
    target_file: BENCH_FIXTURE_TARGET_FILE,
    initial_content: BENCH_FIXTURE_INITIAL,
    expected_content: BENCH_FIXTURE_EXPECTED
  };
}

export async function cloneFixture(source: GlmBenchFixture, label: string): Promise<GlmBenchFixture> {
  const cloneDir = await fsp.mkdtemp(path.join(os.tmpdir(), `sks-glm-bench-${label}-`));
  await gitClone(source.fixture_dir, cloneDir);
  return { ...source, fixture_dir: cloneDir };
}

export async function resetFixture(fixture: GlmBenchFixture): Promise<void> {
  await runGit(['reset', '--hard', 'HEAD'], fixture.fixture_dir);
  await runGit(['clean', '-fdx'], fixture.fixture_dir);
}

export async function cleanupFixture(fixture: GlmBenchFixture): Promise<void> {
  await fsp.rm(fixture.fixture_dir, { recursive: true, force: true }).catch(() => undefined);
}

async function gitInit(dir: string): Promise<void> {
  await runGit(['init', '-q'], dir);
  await runGit(['config', 'user.name', 'sks-bench'], dir);
  await runGit(['config', 'user.email', 'bench@sks.local'], dir);
}

async function gitAdd(dir: string, file: string): Promise<void> {
  await runGit(['add', file], dir);
}

async function gitCommit(dir: string, message: string): Promise<void> {
  await runGit(['commit', '-q', '-m', message], dir);
}

async function gitClone(source: string, dest: string): Promise<void> {
  await runGit(['clone', '-q', source, dest], dest);
}

function runGit(args: readonly string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', [...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git ${args.join(' ')} exited ${code}: ${stderr.trim()}`));
    });
    child.on('error', reject);
  });
}
