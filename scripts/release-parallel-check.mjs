#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportDir = path.join(root, '.sneakoscope', 'reports');
const logDir = path.join(reportDir, 'release-parallel-logs');
fs.mkdirSync(logDir, { recursive: true });

await buildVerificationEngineBootstrap();

const dagMod = await import(pathToFileURL(path.join(root, 'dist/core/verification/verification-dag.js')).href);
const poolMod = await import(pathToFileURL(path.join(root, 'dist/core/verification/verification-worker-pool.js')).href);
const proofMod = await import(pathToFileURL(path.join(root, 'dist/core/verification/verification-proof.js')).href);

const tasks = [
  task('build', 'npm run build --silent', { outputs: ['dist'] }),
  task('runtime:no-src-mjs', 'npm run runtime:no-src-mjs --silent', { dependencies: ['build'] }),
  task('runtime:ts-source-of-truth', 'npm run runtime:ts-source-of-truth --silent', { dependencies: ['build'] }),
  task('runtime:dist-parity', 'npm run runtime:dist-parity --silent', { dependencies: ['build', 'runtime:no-src-mjs'] }),
  task('routes:proof-artifact-structure', 'npm run routes:proof-artifact-structure --silent', { dependencies: ['build'] }),
  task('agent:codex-app-cockpit', 'npm run agent:codex-app-cockpit --silent', { dependencies: ['build'] }),
  task('agent:janitor', 'npm run agent:janitor --silent', { dependencies: ['build'] }),
  task('agent:multi-project-isolation', 'npm run agent:multi-project-isolation --silent', { dependencies: ['build'] }),
  task('verification:parallel-engine', 'npm run verification:parallel-engine --silent', { dependencies: ['build'] }),
  task('typecheck', 'npm run typecheck --silent', { dependencies: ['build'] }),
  task('schema:check', 'npm run schema:check --silent', { dependencies: ['build'] }),
  task('release:metadata', 'npm run release:metadata --silent', { dependencies: ['runtime:dist-parity', 'routes:proof-artifact-structure', 'agent:codex-app-cockpit', 'agent:janitor', 'agent:multi-project-isolation', 'verification:parallel-engine'] }),
  task('release:readiness', 'npm run release:readiness --silent', { dependencies: ['release:metadata', 'typecheck', 'schema:check'] })
];

const dag = dagMod.buildVerificationDag(tasks);
const result = await poolMod.runVerificationDag(dag, {
  cwd: root,
  concurrency: Number(process.env.SKS_VERIFY_CONCURRENCY || os.cpus().length || 2),
  logDir,
  failFast: false
});
result.dag_schema = dag.schema;
result.dependency_count = tasks.reduce((sum, row) => sum + row.dependencies.length, 0);
await proofMod.writeParallelVerificationProof(reportDir, result);
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;

function task(id, command, extra = {}) {
  return { id, command, dependencies: [], outputs: [], ...extra };
}

async function buildVerificationEngineBootstrap() {
  const bootstrap = spawnSync('npm', ['run', 'build', '--silent'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SKS_RELEASE_PARALLEL_BOOTSTRAP: '1' }
  });
  if (bootstrap.status !== 0) {
    process.stdout.write(bootstrap.stdout || '');
    process.stderr.write(bootstrap.stderr || '');
    process.exit(bootstrap.status || 1);
  }
}
