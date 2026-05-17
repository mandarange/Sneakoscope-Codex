import { runProcess, projectRoot, isGitRepo } from './fsx.mjs';
import { redactSecrets } from './secret-redaction.mjs';

const TRAILER = 'Co-authored-by: Codex <noreply@openai.com>';

export async function simpleGitCommitCommand(args = [], opts = {}) {
  const root = await projectRoot();
  const json = args.includes('--json');
  const message = argValue(args, '--message') || argValue(args, '-m') || null;
  const result = await simpleGitCommit(root, { message, push: Boolean(opts.push) });
  if (json) console.log(JSON.stringify(result, null, 2));
  else printSimpleGitCommit(result);
  if (!result.ok) process.exitCode = 1;
}

export async function simpleGitCommit(root, { message = null, push = false } = {}) {
  if (!await isGitRepo(root)) return { schema: 'sks.simple-git.v1', ok: false, reason: 'not_git_repo', root };
  const before = await git(root, ['status', '--short']);
  const changed = statusLines(before.stdout);
  if (!changed.length) return { schema: 'sks.simple-git.v1', ok: false, reason: 'no_changes', root };
  const add = await git(root, ['add', '-A']);
  if (add.code !== 0) return failure(root, 'git_add_failed', before, add);
  const stagedCheck = await git(root, ['diff', '--cached', '--quiet']);
  if (stagedCheck.code === 0) return { schema: 'sks.simple-git.v1', ok: false, reason: 'no_staged_changes', root, changed };
  const commitMessage = ensureCodexTrailer(message || buildCommitMessage(changed));
  const commit = await git(root, ['commit', '-m', commitTitle(commitMessage), '-m', commitBody(commitMessage)]);
  if (commit.code !== 0) return failure(root, 'git_commit_failed', before, commit);
  const hash = await git(root, ['rev-parse', '--short', 'HEAD']);
  let pushResult = null;
  if (push) {
    pushResult = await git(root, ['push']);
    if (pushResult.code !== 0) return failure(root, 'git_push_failed', before, pushResult, { commit: commitSummary(commit), hash: hash.stdout.trim() });
  }
  return redactSecrets({
    schema: 'sks.simple-git.v1',
    ok: true,
    root,
    action: push ? 'commit-and-push' : 'commit',
    changed,
    commit: commitSummary(commit),
    hash: hash.stdout.trim(),
    pushed: Boolean(push && pushResult?.code === 0),
    push: pushResult ? { ok: pushResult.code === 0, stdout: pushResult.stdout.trim(), stderr: pushResult.stderr.trim() } : null
  });
}

function failure(root, reason, before, failed, extra = {}) {
  return redactSecrets({
    schema: 'sks.simple-git.v1',
    ok: false,
    root,
    reason,
    changed: statusLines(before?.stdout || ''),
    command: { code: failed.code, stdout: failed.stdout.trim(), stderr: failed.stderr.trim() },
    ...extra
  });
}

async function git(root, args) {
  return runProcess('git', args, { cwd: root, timeoutMs: 120000, maxOutputBytes: 256 * 1024 });
}

function statusLines(text = '') {
  return String(text || '').split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
}

function buildCommitMessage(changed = []) {
  const counts = {};
  for (const line of changed) {
    const status = line.slice(0, 2).trim() || 'changed';
    counts[status] = (counts[status] || 0) + 1;
  }
  const summary = Object.entries(counts).map(([status, count]) => `${status}:${count}`).join(', ') || 'changes';
  const files = changed.slice(0, 12).map((line) => `- ${line}`).join('\n');
  const more = changed.length > 12 ? `\n- ...and ${changed.length - 12} more` : '';
  return `chore: update project changes\n\nSummary: ${summary}\n\nChanged files:\n${files}${more}`;
}

function ensureCodexTrailer(message = '') {
  const withoutDuplicate = String(message || '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== TRAILER)
    .join('\n')
    .trimEnd();
  return `${withoutDuplicate}\n\n${TRAILER}`;
}

function commitTitle(message = '') {
  return String(message || '').split(/\r?\n/)[0].trim() || 'chore: update project changes';
}

function commitBody(message = '') {
  return String(message || '').split(/\r?\n/).slice(1).join('\n').trim();
}

function commitSummary(result) {
  const line = String(result.stdout || '').split(/\r?\n/).find((row) => /^\[[^\]]+\s+[0-9a-f]+\]/.test(row.trim()));
  return line?.trim() || String(result.stdout || '').split(/\r?\n/).find(Boolean)?.trim() || 'commit created';
}

function argValue(args = [], name) {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !String(args[index + 1]).startsWith('--')) return args[index + 1];
  const prefix = `${name}=`;
  const hit = args.find((arg) => String(arg).startsWith(prefix));
  return hit ? String(hit).slice(prefix.length) : null;
}

function printSimpleGitCommit(result) {
  if (!result.ok) {
    console.error(`Git ${result.action || 'commit'} failed: ${result.reason}`);
    if (result.command?.stderr) console.error(result.command.stderr);
    return;
  }
  console.log(`Git ${result.action}: ${result.hash}`);
  console.log(result.commit);
  if (result.pushed) console.log('Push: ok');
}
