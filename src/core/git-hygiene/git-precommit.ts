import fsp from 'node:fs/promises';
import path from 'node:path';
import { readJson } from '../fsx.js';
import { classifySksPath, isGeneratedIndexPath, isLocalRuntimePath, isSharedMemoryPath, readGitPolicy, type SksGitPolicy } from './git-policy.js';
import { fileSize, stagedFiles } from './git-status.js';
import { sharedRecordHasSecret } from './shared-memory-security.js';
import { validateSharedRecordFile } from './validators.js';

export interface GitPrecommitReport {
  schema: 'sks.git-precommit.v1';
  ok: boolean;
  mode: string;
  staged: string[];
  blockers: string[];
  warnings: string[];
  checks: Array<{ id: string; ok: boolean; files: string[] }>;
}

export async function gitPrecommit(root: string): Promise<GitPrecommitReport> {
  const policy = await readGitPolicy(root);
  const staged = await stagedFiles(root);
  const checks: GitPrecommitReport['checks'] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  const runtime = staged.filter((file) => isLocalRuntimePath(file, policy));
  pushCheck(checks, blockers, 'runtime_noise_not_staged', runtime.length === 0, runtime);

  const generated = staged.filter((file) => isGeneratedIndexPath(file, policy));
  if (policy.mode === 'strict-work') pushCheck(checks, blockers, 'generated_indexes_not_staged', generated.length === 0, generated);
  else {
    checks.push({ id: 'generated_indexes_not_staged', ok: generated.length === 0, files: generated });
    if (generated.length) warnings.push('generated_indexes_staged');
  }

  const shared = staged.filter((file) => isSharedMemoryPath(file, policy));
  const invalidShared: string[] = [];
  const secretShared: string[] = [];
  const largeFiles: string[] = [];
  for (const file of staged) {
    const size = await fileSize(root, file);
    if (size > policy.large_artifacts.max_tracked_file_bytes) largeFiles.push(file);
  }
  for (const file of shared.filter((candidate) => candidate.endsWith('.json') && !candidate.endsWith('git-policy.json') && !candidate.endsWith('shared-memory-manifest.json'))) {
    const validation = await validateSharedRecordFile(path.join(root, file), policy);
    if (!validation.ok) invalidShared.push(`${file}:${validation.issues.join('|')}`);
    const text = await fsp.readFile(path.join(root, file), 'utf8').catch(() => '');
    if (sharedRecordHasSecret(text)) secretShared.push(file);
  }
  const policyJson = staged.includes('.sneakoscope/git-policy.json') ? validatePolicy(await readJson(path.join(root, '.sneakoscope/git-policy.json'), null)) : [];
  if (policyJson.length) invalidShared.push(`.sneakoscope/git-policy.json:${policyJson.join('|')}`);

  pushCheck(checks, blockers, 'shared_record_schemas_valid', invalidShared.length === 0, invalidShared);
  pushCheck(checks, blockers, 'shared_records_secret_free', secretShared.length === 0, secretShared);
  pushCheck(checks, blockers, 'large_files_within_policy', largeFiles.length === 0, largeFiles);

  const unknown = staged.filter((file) => classifySksPath(file, policy) === 'unknown_sks');
  checks.push({ id: 'unknown_sks_files_classified', ok: unknown.length === 0, files: unknown });
  if (unknown.length) warnings.push('unknown_sks_files_staged');

  return {
    schema: 'sks.git-precommit.v1',
    ok: blockers.length === 0,
    mode: policy.mode,
    staged,
    blockers,
    warnings,
    checks
  };
}

function pushCheck(checks: GitPrecommitReport['checks'], blockers: string[], id: string, ok: boolean, files: string[]): void {
  checks.push({ id, ok, files });
  if (!ok) blockers.push(id);
}

function validatePolicy(value: unknown): string[] {
  if (!value || typeof value !== 'object') return ['invalid_json'];
  const row = value as Partial<SksGitPolicy>;
  const issues: string[] = [];
  if (row.schema !== 'sks.git-policy.v1') issues.push('schema');
  if (!row.shared_memory || !row.local_runtime) issues.push('planes');
  return issues;
}
