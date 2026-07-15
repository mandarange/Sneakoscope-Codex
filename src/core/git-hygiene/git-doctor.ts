import fsp from 'node:fs/promises';
import path from 'node:path';
import { exists, readJson, readText } from '../fsx.js';
import { hasGitattributesBlock, installGitattributesBlock } from './gitattributes-writer.js';
import { gitStatusSummary, gitRoot, isIgnored, listSharedFiles, trackedFiles } from './git-status.js';
import { hasGitignoreBlock, installGitignoreBlock, removeLegacyGitInfoExclude } from './gitignore-writer.js';
import { ensureGitPolicy, ensureSharedMemoryDirs, gitPolicyPath, isSharedMemoryPath, readGitPolicy, sharedMemoryManifestPath, type SksGitPolicy } from './git-policy.js';
import { sharedRecordHasSecret } from './shared-memory-security.js';
import { validateGitPolicy, validateSharedMemoryManifest, validateSharedRecordFile } from './validators.js';

export interface GitDoctorCheck {
  id: string;
  ok: boolean;
  detail: string;
}

export interface GitDoctorReport {
  schema: 'sks.git-doctor.v1';
  ok: boolean;
  mode: string;
  git_root: string;
  checks: GitDoctorCheck[];
  tracked_shared_memory: string[];
  untracked_shared_candidates: string[];
  ignored_runtime_files: string[];
  blockers: string[];
  warnings: string[];
  fixed?: string[];
}

export async function gitDoctor(root: string, opts: { fix?: boolean; mode?: unknown; json?: boolean } = {}): Promise<GitDoctorReport> {
  const fixed: string[] = [];
  const actualRoot = await gitRoot(root);
  const reportRoot = actualRoot || root;
  if (opts.fix) {
    const policy = await ensureGitPolicy(reportRoot, { mode: opts.mode || 'work', write: true });
    const ignore = await installGitignoreBlock(reportRoot);
    const exclude = await removeLegacyGitInfoExclude(reportRoot);
    const attrs = await installGitattributesBlock(reportRoot, policy);
    await ensureSharedMemoryDirs(reportRoot);
    if (ignore.changed) fixed.push('.gitignore');
    if (exclude.changed) fixed.push('.git/info/exclude');
    if (attrs.changed) fixed.push('.gitattributes');
    fixed.push('.sneakoscope/git-policy.json', '.sneakoscope/shared-memory-manifest.json');
  }
  const policy = await readGitPolicy(reportRoot);
  const checks: GitDoctorCheck[] = [];
  checks.push(check('repo_is_git_repo', Boolean(actualRoot), actualRoot ? `git root ${actualRoot}` : 'not a git repository'));

  const gitignore = await readText(path.join(reportRoot, '.gitignore'), '');
  const attrs = await readText(path.join(reportRoot, '.gitattributes'), '');
  checks.push(check('gitignore_managed_block', hasGitignoreBlock(gitignore), '.gitignore contains SKS managed hygiene block'));
  checks.push(check('gitattributes_managed_block', hasGitattributesBlock(attrs), '.gitattributes contains SKS managed attributes block'));

  const policyFile = await readJson(gitPolicyPath(reportRoot), null);
  const manifestFile = await readJson(sharedMemoryManifestPath(reportRoot), null);
  const policyValidation = validateGitPolicy(policyFile);
  const manifestValidation = validateSharedMemoryManifest(manifestFile);
  checks.push(check('git_policy_valid', policyValidation.ok, policyValidation.ok ? 'git policy valid' : policyValidation.issues.join(', ')));
  checks.push(check('shared_memory_manifest_valid', manifestValidation.ok, manifestValidation.ok ? 'shared memory manifest valid' : manifestValidation.issues.join(', ')));

  for (const dir of ['.sneakoscope/wiki/records/claims', '.sneakoscope/wiki/wrongness', '.sneakoscope/wiki/image-voxels', '.sneakoscope/wiki/avoidance-rules']) {
    checks.push(check(`dir_exists:${dir}`, await exists(path.join(reportRoot, dir)), `${dir} exists`));
  }

  checks.push(check('runtime_dirs_ignored', await isIgnored(reportRoot, '.sneakoscope/missions/__sks_check__.json'), '.sneakoscope/missions is ignored'));
  checks.push(check('shared_wiki_not_ignored', !(await isIgnored(reportRoot, '.sneakoscope/wiki/records/claims/__sks_check__.json')), '.sneakoscope/wiki/records is trackable'));
  checks.push(check('generated_indexes_ignored', await isIgnored(reportRoot, '.sneakoscope/wiki/indexes/project-index.json'), '.sneakoscope/wiki/indexes is ignored'));

  const status = await gitStatusSummary(reportRoot, policy);
  const largeTracked = await largeTrackedFiles(reportRoot, policy);
  checks.push(check('large_tracked_files', largeTracked.length === 0, largeTracked.length ? largeTracked.join(', ') : 'no large tracked SKS shared files'));

  const secretFiles = await secretBearingSharedFiles(reportRoot);
  checks.push(check('secret_bearing_shared_files', secretFiles.length === 0, secretFiles.length ? secretFiles.join(', ') : 'no secret-bearing shared files'));

  const sharedValidation = await validateAllSharedFiles(reportRoot, policy);
  checks.push(check('shared_memory_record_schemas', sharedValidation.issues.length === 0, sharedValidation.issues.length ? sharedValidation.issues.slice(0, 8).join(', ') : 'shared record schemas valid'));

  const unpublishedWrongness = await unpublishedWrongnessRecords(reportRoot);
  checks.push(check('active_local_wrongness_published', unpublishedWrongness.length === 0, unpublishedWrongness.length ? unpublishedWrongness.join(', ') : 'no active local wrongness waiting for publish'));

  const staleIndexes = await staleGeneratedIndexes(reportRoot);
  checks.push(check('generated_indexes_fresh', staleIndexes.length === 0, staleIndexes.length ? staleIndexes.join(', ') : 'generated indexes fresh or absent'));

  const blockers = checks.filter((row) => !row.ok && /repo|git_policy|shared_memory_record_schemas|secret|runtime_dirs|shared_wiki/.test(row.id)).map((row) => row.id);
  const warnings = [
    ...checks.filter((row) => !row.ok && !blockers.includes(row.id)).map((row) => row.id),
    ...status.warnings
  ];
  return {
    schema: 'sks.git-doctor.v1',
    ok: blockers.length === 0,
    mode: policy.mode,
    git_root: reportRoot,
    checks,
    tracked_shared_memory: status.tracked_shared_memory,
    untracked_shared_candidates: status.untracked_shared_candidates,
    ignored_runtime_files: status.ignored_runtime_files,
    blockers,
    warnings,
    ...(fixed.length ? { fixed } : {})
  };
}

function check(id: string, ok: boolean, detail: string): GitDoctorCheck {
  return { id, ok, detail };
}

async function largeTrackedFiles(root: string, policy: SksGitPolicy): Promise<string[]> {
  const files = await trackedFiles(root);
  const max = policy.large_artifacts.max_tracked_file_bytes;
  const out: string[] = [];
  for (const file of files.filter((candidate) => candidate.startsWith('.sneakoscope/'))) {
    const size = await fsp.stat(path.join(root, file)).then((stat) => stat.size, () => 0);
    if (size > max) out.push(`${file}:${size}`);
  }
  return out;
}

async function secretBearingSharedFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const file of await listSharedFiles(root)) {
    try {
      const text = await fsp.readFile(path.join(root, file), 'utf8');
      if (sharedRecordHasSecret(text)) out.push(file);
    } catch {}
  }
  return out;
}

async function validateAllSharedFiles(root: string, policy: SksGitPolicy): Promise<{ issues: string[] }> {
  const issues: string[] = [];
  for (const file of (await listSharedFiles(root)).filter((candidate) => candidate.endsWith('.json') && isSharedMemoryPath(candidate, policy))) {
    if (file.endsWith('git-policy.json') || file.endsWith('shared-memory-manifest.json')) continue;
    const validation = await validateSharedRecordFile(path.join(root, file), policy);
    if (!validation.ok) issues.push(`${file}:${validation.issues.join('|')}`);
  }
  return { issues };
}

async function unpublishedWrongnessRecords(root: string): Promise<string[]> {
  const ledger = await readJson(path.join(root, '.sneakoscope', 'wiki', 'wrongness-ledger.json'), null);
  const records = Array.isArray(ledger?.records) ? ledger.records : [];
  const out: string[] = [];
  for (const record of records) {
    if (record?.status !== 'active') continue;
    const id = String(record.id || '');
    if (id && !(await exists(path.join(root, '.sneakoscope', 'wiki', 'wrongness', `${id}.json`)))) out.push(id);
  }
  return out;
}

async function staleGeneratedIndexes(root: string): Promise<string[]> {
  const shardFiles = await listSharedFiles(root);
  const latestShard = await latestMtime(root, shardFiles);
  const indexes = ['.sneakoscope/wiki/indexes/project-index.json', '.sneakoscope/wiki/indexes/wrongness-index.json'];
  const out: string[] = [];
  for (const index of indexes) {
    const mtime = await fileMtime(path.join(root, index));
    if (mtime > 0 && latestShard > 0 && mtime < latestShard) out.push(index);
  }
  return out;
}

async function latestMtime(root: string, files: string[]): Promise<number> {
  let latest = 0;
  for (const file of files) latest = Math.max(latest, await fileMtime(path.join(root, file)));
  return latest;
}

async function fileMtime(file: string): Promise<number> {
  return fsp.stat(file).then((stat) => stat.mtimeMs, () => 0);
}
