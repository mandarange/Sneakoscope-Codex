import { projectRoot } from '../fsx.js';
import { ensureGitPolicy } from '../git-hygiene/git-policy.js';
import { gitDoctor } from '../git-hygiene/git-doctor.js';
import { gitPrecommit } from '../git-hygiene/git-precommit.js';
import { gitStatusSummary } from '../git-hygiene/git-status.js';
import { installGitattributesBlock } from '../git-hygiene/gitattributes-writer.js';
import { installGitignoreBlock, removeLegacyGitInfoExclude } from '../git-hygiene/gitignore-writer.js';
import { publishPlan, sharedMemorySummary } from '../git-hygiene/shared-memory-publish.js';
import { flag, readOption } from './command-utils.js';

export async function gitCommand(args: string[] = []) {
  const [action = 'status', ...rest] = args;
  const root = await projectRoot();
  if (action === 'policy') return gitPolicyCommand(root, rest);
  if (action === 'install') return gitInstallCommand(root, rest);
  if (action === 'status') return gitStatusCommand(root, rest);
  if (action === 'doctor') return gitDoctorCommand(root, rest);
  if (action === 'precommit') return gitPrecommitCommand(root, rest);
  if (action === 'publish-plan') return gitPublishPlanCommand(root, rest);
  if (action === 'summary') return gitSummaryCommand(root, rest);
  if (action === 'help' || action === '--help') return gitHelp();
  console.error('Usage: sks git policy|install|status|doctor|precommit|publish-plan|summary [--json]');
  process.exitCode = 2;
}

async function gitPolicyCommand(root: string, args: string[]) {
  const policy = await ensureGitPolicy(root, {
    mode: readOption(args, '--mode', 'work'),
    write: flag(args, '--write'),
    imageBinaryPolicy: readOption(args, '--image-binary-policy', null)
  });
  return output(args, policy, () => {
    console.log(`SKS git policy: ${policy.mode}`);
    console.log(`Shared memory patterns: ${policy.shared_memory.track.length}`);
    console.log(`Runtime ignore patterns: ${policy.local_runtime.ignore.length}`);
    console.log(`Large file policy: ${policy.large_artifacts.image_binary_policy}, max ${policy.large_artifacts.max_tracked_file_bytes} bytes`);
  });
}

async function gitInstallCommand(root: string, args: string[]) {
  const policy = await ensureGitPolicy(root, {
    mode: readOption(args, '--mode', 'work'),
    write: true,
    imageBinaryPolicy: readOption(args, '--image-binary-policy', null)
  });
  const gitignore = await installGitignoreBlock(root);
  const gitExclude = await removeLegacyGitInfoExclude(root);
  const gitattributes = await installGitattributesBlock(root, policy);
  const result = {
    schema: 'sks.git-install.v1',
    ok: true,
    mode: policy.mode,
    gitignore,
    git_exclude: gitExclude,
    gitattributes,
    policy: '.sneakoscope/git-policy.json',
    shared_memory_manifest: '.sneakoscope/shared-memory-manifest.json',
    precommit_hook_installed: false,
    precommit_hook_note: flag(args, '--precommit')
      ? 'SKS does not install Git hooks automatically; run `sks git precommit` from your own hook if desired.'
      : 'Run `sks git precommit` manually or from a human-owned hook.'
  };
  return output(args, result, () => {
    console.log('SKS git collaboration files installed');
    console.log(`- .gitignore: ${gitignore.changed ? 'updated' : 'unchanged'}`);
    if (gitExclude.changed) console.log('- .git/info/exclude: removed broad .sneakoscope ignore');
    console.log(`- .gitattributes: ${gitattributes.changed ? 'updated' : 'unchanged'}`);
    console.log('- .sneakoscope/git-policy.json');
    console.log('- .sneakoscope/shared-memory-manifest.json');
    if (flag(args, '--precommit')) console.log(`- precommit hook: not installed (${result.precommit_hook_note})`);
  });
}

async function gitStatusCommand(root: string, args: string[]) {
  const policy = await ensureGitPolicy(root, { write: false });
  const status = await gitStatusSummary(root, policy);
  if (!status.ok) process.exitCode = 1;
  return output(args, status, () => {
    console.log(`SKS git status: ${status.ok ? 'ok' : 'blocked'}`);
    console.log(`Tracked shared memory: ${status.tracked_shared_memory.length}`);
    console.log(`Untracked shared candidates: ${status.untracked_shared_candidates.length}`);
    console.log(`Ignored runtime files: ${status.ignored_runtime_files.length}`);
    for (const warning of status.warnings) console.log(`- warning: ${warning}`);
  });
}

async function gitDoctorCommand(root: string, args: string[]) {
  const report = await gitDoctor(root, { fix: flag(args, '--fix'), mode: readOption(args, '--mode', 'work'), json: flag(args, '--json') });
  if (!report.ok) process.exitCode = 1;
  return output(args, report, () => {
    console.log(`SKS git doctor: ${report.ok ? 'ok' : 'blocked'}`);
    for (const row of report.checks) console.log(`- ${row.ok ? 'ok' : 'fail'} ${row.id}: ${row.detail}`);
    if (report.fixed?.length) console.log(`Fixed: ${report.fixed.join(', ')}`);
  });
}

async function gitPrecommitCommand(root: string, args: string[]) {
  const report = await gitPrecommit(root);
  if (!report.ok) process.exitCode = 1;
  return output(args, report, () => {
    console.log(`SKS git precommit: ${report.ok ? 'ok' : 'blocked'}`);
    for (const row of report.checks) {
      if (!row.ok) console.log(`- ${row.id}: ${row.files.join(', ')}`);
    }
    for (const warning of report.warnings) console.log(`- warning: ${warning}`);
  });
}

async function gitPublishPlanCommand(root: string, args: string[]) {
  const plan = await publishPlan(root);
  return output(args, plan, () => {
    console.log('SKS git publish plan');
    for (const command of plan.commands as string[]) console.log(`- ${command}`);
  });
}

async function gitSummaryCommand(root: string, args: string[]) {
  const policy = await ensureGitPolicy(root, { write: false });
  const status = await gitStatusSummary(root, policy);
  const memory = await sharedMemorySummary(root);
  const result = {
    schema: 'sks.git-summary.v1',
    ok: status.ok && memory.ok,
    mode: policy.mode,
    status,
    shared_memory: memory
  };
  if (!result.ok) process.exitCode = 1;
  return output(args, result, () => {
    const indexes = memory.indexes as { claims: number; wrongness: number; image_voxels: number };
    console.log(`SKS git collaboration: ${result.ok ? 'ok' : 'blocked'}`);
    console.log(`Mode: ${policy.mode}`);
    console.log(`Shared files: ${memory.files}`);
    console.log(`Claims: ${indexes.claims}, wrongness: ${indexes.wrongness}, image voxels: ${indexes.image_voxels}`);
  });
}

function gitHelp() {
  console.log('Usage: sks git policy|install|status|doctor|precommit|publish-plan|summary [--json]');
}

function output(args: string[], value: unknown, print: () => void) {
  if (flag(args, '--json')) console.log(JSON.stringify(value, null, 2));
  else print();
  return value;
}
