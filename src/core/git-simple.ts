import path from 'node:path';
import { runProcess, projectRoot, isGitRepo, nowIso, sha256 } from './fsx.js';
import { redactSecrets } from './secret-redaction.js';
import { runOllamaAgent } from './agents/agent-runner-ollama.js';
import { resolveOllamaWorkerConfig } from './agents/ollama-worker-config.js';

const TRAILER = 'Co-authored-by: Codex <noreply@openai.com>';

export async function simpleGitCommitCommand(args: any = [], opts: any = {}) {
  const root = await projectRoot();
  const json = args.includes('--json');
  const message = argValue(args, '--message') || argValue(args, '-m') || null;
  const result = await simpleGitCommit(root, { message, push: Boolean(opts.push) });
  if (json) console.log(JSON.stringify(result, null, 2));
  else printSimpleGitCommit(result);
  if (!result.ok) process.exitCode = 1;
}

export async function simpleGitCommit(root: any, { message = null, push = false }: any = {}) {
  if (!await isGitRepo(root)) return { schema: 'sks.simple-git.v1', ok: false, reason: 'not_git_repo', root };
  const [before, branch, head] = await Promise.all([
    git(root, ['status', '--short']),
    git(root, ['branch', '--show-current']),
    git(root, ['rev-parse', '--short', 'HEAD'])
  ]);
  const changed = statusLines(before.stdout);
  if (!changed.length) return { schema: 'sks.simple-git.v1', ok: false, reason: 'no_changes', root };
  const localWorker = message
    ? localWorkerSkipped('message_provided')
    : await draftCommitMessageWithLocalWorker(root, changed, { push, branch: branch.stdout.trim(), head: head.stdout.trim() });
  const add = await git(root, ['add', '-A']);
  if (add.code !== 0) return failure(root, 'git_add_failed', before, add);
  const stagedCheck = await git(root, ['diff', '--cached', '--quiet']);
  if (stagedCheck.code === 0) return { schema: 'sks.simple-git.v1', ok: false, reason: 'no_staged_changes', root, changed };
  const commitMessage = ensureCodexTrailer(message || localWorker.message || buildCommitMessage(changed));
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
    push: pushResult ? { ok: pushResult.code === 0, stdout: pushResult.stdout.trim(), stderr: pushResult.stderr.trim() } : null,
    local_worker: localWorker.report
  });
}

function failure(root: any, reason: any, before: any, failed: any, extra: any = {}) {
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

async function git(root: any, args: any) {
  return runProcess('git', args, { cwd: root, timeoutMs: 120000, maxOutputBytes: 256 * 1024 });
}

function statusLines(text: any = '') {
  return String(text || '').split(/\r?\n/).map((line: any) => line.trimEnd()).filter(Boolean);
}

function buildCommitMessage(changed: any = []) {
  const counts: Record<string, number> = {};
  for (const line of changed) {
    const status = line.slice(0, 2).trim() || 'changed';
    counts[status] = (counts[status] || 0) + 1;
  }
  const summary = Object.entries(counts).map(([status, count]: any) => `${status}:${count}`).join(', ') || 'changes';
  const files = changed.slice(0, 12).map((line: any) => `- ${line}`).join('\n');
  const more = changed.length > 12 ? `\n- ...and ${changed.length - 12} more` : '';
  return `chore: update project changes\n\nSummary: ${summary}\n\nChanged files:\n${files}${more}`;
}

async function draftCommitMessageWithLocalWorker(root: string, changed: string[], context: { push: boolean; branch: string; head: string }) {
  const disabled = String(process.env.SKS_SIMPLE_GIT_LOCAL_LLM || '').trim() === '0';
  if (disabled) return { message: null, report: localWorkerSkipped('disabled_by_SKS_SIMPLE_GIT_LOCAL_LLM') };
  const config = await resolveOllamaWorkerConfig().catch((error: unknown) => null);
  if (!config?.ok || config.enabled !== true) {
    return {
      message: null,
      report: {
        schema: 'sks.simple-git-local-worker.v1',
        generated_at: nowIso(),
        ok: false,
        used: false,
        enabled: config?.enabled === true,
        provider: config?.provider || 'ollama',
        model: config?.model || null,
        worker_only: true,
        parent_owned_git_mutation: true,
        task: context.push ? 'commit-and-push-message-draft' : 'commit-message-draft',
        blockers: config?.blockers || ['ollama_worker_config_unavailable']
      }
    };
  }
  const runId = sha256(`${nowIso()}:${context.branch}:${context.head}:${changed.join('\n')}`).slice(0, 12);
  const workerDirRel = path.join('.git', 'sks-local-workers', 'simple-git', runId);
  const slice = {
    id: `simple-git-message-${runId}`,
    role: 'collector',
    domain: 'git',
    description: [
      'simple collect summarize git status for a commit message draft only',
      'Do not run git commands. Do not choose whether to commit or push.',
      'Return summary as a conventional commit title and proposed_changes as short body bullets.',
      `Action: ${context.push ? 'commit-and-push' : 'commit'}`,
      `Branch: ${context.branch || 'unknown'}`,
      `HEAD before commit: ${context.head || 'unknown'}`,
      'Changed status lines:',
      ...changed.slice(0, 80)
    ].join('\n')
  };
  const agent = {
    id: 'simple_git_local_worker',
    session_id: `simple-git-${runId}`,
    slot_id: 'local-worker',
    generation_index: 1,
    persona_id: 'local_git_summarizer',
    role: 'collector'
  };
  const result = await runOllamaAgent(agent, slice, {
    missionId: `simple-git-${runId}`,
    agentRoot: root,
    cwd: root,
    workerDirRel,
    route: context.push ? '$Commit-And-Push' : '$Commit',
    fastMode: true,
    serviceTier: 'fast',
    ollamaTimeoutMs: Number(process.env.SKS_SIMPLE_GIT_OLLAMA_TIMEOUT_MS || 15000)
  }).catch((error: unknown) => ({
    status: 'blocked',
    summary: '',
    findings: [],
    proposed_changes: [],
    artifacts: [],
    blockers: [error instanceof Error ? error.message : String(error)]
  }));
  const message = result.status === 'done' ? localWorkerCommitMessage(result, changed) : null;
  return {
    message,
    report: {
      schema: 'sks.simple-git-local-worker.v1',
      generated_at: nowIso(),
      ok: result.status === 'done',
      used: Boolean(message),
      enabled: true,
      provider: config.provider,
      model: config.model,
      worker_only: true,
      parent_owned_git_mutation: true,
      task: context.push ? 'commit-and-push-message-draft' : 'commit-message-draft',
      artifacts: result.artifacts || [],
      summary: result.summary || null,
      blockers: result.blockers || [],
      fallback: message ? null : 'deterministic_commit_message'
    }
  };
}

function localWorkerCommitMessage(result: any, changed: string[]) {
  const title = normalizeCommitTitle(result.summary);
  if (!title) return null;
  const bodyLines = [
    'Summary: local Ollama worker drafted this message from git status; parent SKS performed all git mutations.',
    '',
    ...stringArray(result.proposed_changes || result.findings).slice(0, 8).map((line) => `- ${line}`),
    ...(stringArray(result.proposed_changes || result.findings).length ? [] : changed.slice(0, 8).map((line) => `- ${line}`))
  ];
  return `${title}\n\n${bodyLines.join('\n')}`;
}

function normalizeCommitTitle(value: any) {
  const raw = String(value || '').split(/\r?\n/)[0]?.trim() || '';
  const stripped = raw.replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim();
  if (!stripped) return '';
  const conventional = /^[a-z][a-z0-9-]*(\([^)]+\))?:\s+\S/.test(stripped);
  const title = conventional ? stripped : `chore: ${stripped.replace(/^(commit message|summary)\s*:\s*/i, '')}`;
  return title.length > 96 ? title.slice(0, 93).trimEnd() + '...' : title;
}

function stringArray(value: any) {
  return Array.isArray(value) ? value.map((line: any) => String(line || '').trim()).filter(Boolean) : [];
}

function localWorkerSkipped(reason: string) {
  return {
    message: null,
    report: {
      schema: 'sks.simple-git-local-worker.v1',
      generated_at: nowIso(),
      ok: true,
      used: false,
      enabled: false,
      provider: 'ollama',
      model: null,
      worker_only: true,
      parent_owned_git_mutation: true,
      task: 'commit-message-draft',
      blockers: [reason]
    }
  };
}

function ensureCodexTrailer(message: any = '') {
  const withoutDuplicate = String(message || '')
    .split(/\r?\n/)
    .filter((line: any) => line.trim() !== TRAILER)
    .join('\n')
    .trimEnd();
  return `${withoutDuplicate}\n\n${TRAILER}`;
}

function commitTitle(message: any = '') {
  return (String(message || '').split(/\r?\n/)[0] || '').trim() || 'chore: update project changes';
}

function commitBody(message: any = '') {
  return String(message || '').split(/\r?\n/).slice(1).join('\n').trim();
}

function commitSummary(result: any) {
  const line = String(result.stdout || '').split(/\r?\n/).find((row: any) => /^\[[^\]]+\s+[0-9a-f]+\]/.test(row.trim()));
  return line?.trim() || String(result.stdout || '').split(/\r?\n/).find(Boolean)?.trim() || 'commit created';
}

function argValue(args: any = [], name: any) {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !String(args[index + 1]).startsWith('--')) return args[index + 1];
  const prefix = `${name}=`;
  const hit = args.find((arg: any) => String(arg).startsWith(prefix));
  return hit ? String(hit).slice(prefix.length) : null;
}

function printSimpleGitCommit(result: any) {
  if (!result.ok) {
    console.error(`Git ${result.action || 'commit'} failed: ${result.reason}`);
    if (result.command?.stderr) console.error(result.command.stderr);
    return;
  }
  console.log(`Git ${result.action}: ${result.hash}`);
  console.log(result.commit);
  if (result.pushed) console.log('Push: ok');
}
