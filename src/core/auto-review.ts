import os from 'node:os';
import path from 'node:path';
import { ensureDir, exists, readText, writeTextAtomic } from './fsx.js';

export const AUTO_REVIEW_REVIEWER = 'auto_review';
export const LEGACY_AUTO_REVIEW_REVIEWER = 'guardian_subagent';
export const AUTO_REVIEW_PROFILE = 'sks-auto-review';
export const AUTO_REVIEW_HIGH_PROFILE = 'sks-auto-review-high';
export const MAD_HIGH_PROFILE = 'sks-mad-high';
export const REVIEW_NATIVE_AGENT_PLAN = Object.freeze({
  schema: 'sks.review-native-agent-plan.v1',
  backend: 'native_multi_session_agent_kernel',
  central_ledger: 'agents/agent-events.jsonl',
  personas: [
    {
      id: 'review_safety',
      role: 'safety',
      label: 'Review Safety',
      read_only: true,
      mandate: 'Review permission, DB, destructive action, and unrequested fallback risks before approval.'
    },
    {
      id: 'review_verifier',
      role: 'verifier',
      label: 'Review Verifier',
      read_only: true,
      mandate: 'Check claims, tests, and route evidence before approval.'
    },
    {
      id: 'review_integrator',
      role: 'integrator',
      label: 'Review Integrator',
      read_only: true,
      mandate: 'Close approval only after ledger, session cleanup, and proof graph pass.'
    }
  ],
  safety_personas_read_only_by_default: true,
  manual_agent_count_syntax: 'sks auto-review fixture --json and sks agent run "<review task>" --route $Review --agents 5 --concurrency 5 --mock --json',
  dynamic_effort: 'parent assigns high effort to safety/integrator lanes and medium or higher to verification lanes when proof risk is present'
});

export function codexHome(env: any = process.env) {
  return path.resolve(env.CODEX_HOME || path.join(env.HOME || os.homedir(), '.codex'));
}

export function codexConfigPath(env: any = process.env) {
  return path.join(codexHome(env), 'config.toml');
}

export function codexProfileConfigPath(profile: any, env: any = process.env) {
  return path.join(codexHome(env), `${String(profile || '').trim()}.config.toml`);
}

export function autoReviewProfileName(opts: any = {}) {
  return opts.high ? AUTO_REVIEW_HIGH_PROFILE : AUTO_REVIEW_PROFILE;
}

export async function autoReviewStatus(opts: any = {}) {
  const configPath = opts.configPath || codexConfigPath(opts.env || process.env);
  const text = await readText(configPath, '');
  const profileText = await readText(path.join(path.dirname(configPath), `${AUTO_REVIEW_PROFILE}.config.toml`), '');
  const highProfileText = await readText(path.join(path.dirname(configPath), `${AUTO_REVIEW_HIGH_PROFILE}.config.toml`), '');
  const approvalsReviewer = readTomlString(text, 'approvals_reviewer');
  const profileReviewer = readTomlString(profileText, 'approvals_reviewer');
  const highProfileReviewer = readTomlString(highProfileText, 'approvals_reviewer');
  const legacyReviewProfile = readTableString(text, `profiles.${AUTO_REVIEW_PROFILE}`, 'approvals_reviewer');
  const legacyHighProfile = readTableString(text, `profiles.${AUTO_REVIEW_HIGH_PROFILE}`, 'approvals_reviewer');
  return {
    config_path: configPath,
    exists: await exists(configPath),
    approvals_reviewer: approvalsReviewer,
    enabled: approvalsReviewer === AUTO_REVIEW_REVIEWER,
    profile: profileReviewer === AUTO_REVIEW_REVIEWER,
    high_profile: highProfileReviewer === AUTO_REVIEW_REVIEWER,
    legacy_invalid: [approvalsReviewer, profileReviewer, highProfileReviewer, legacyReviewProfile, legacyHighProfile].includes(LEGACY_AUTO_REVIEW_REVIEWER),
    policy: readTableString(text, 'auto_review', 'policy') || '',
    native_agent_plan: REVIEW_NATIVE_AGENT_PLAN
  };
}

export async function enableAutoReview(opts: any = {}) {
  const configPath = opts.configPath || codexConfigPath(opts.env || process.env);
  const high = Boolean(opts.high);
  await ensureDir(path.dirname(configPath));
  const current = await readText(configPath, '');
  let next = current || '';
  next = upsertTopLevelString(next, 'approvals_reviewer', AUTO_REVIEW_REVIEWER);
  next = removeLegacyProfileConfig(next, AUTO_REVIEW_PROFILE);
  next = removeLegacyProfileConfig(next, AUTO_REVIEW_HIGH_PROFILE);
  next = upsertAutoReviewPolicy(next);
  if (!next.endsWith('\n')) next += '\n';
  await writeTextAtomic(configPath, next);
  await writeProfileConfig(configPath, AUTO_REVIEW_PROFILE, profileConfigBlock({ effort: 'medium' }));
  await writeProfileConfig(configPath, AUTO_REVIEW_HIGH_PROFILE, profileConfigBlock({ effort: 'high' }));
  return {
    ...(await autoReviewStatus({ configPath })),
    profile_name: autoReviewProfileName({ high }),
    launch_args: ['--profile', autoReviewProfileName({ high })]
  };
}

export async function enableMadHighProfile(opts: any = {}) {
  const configPath = opts.configPath || codexConfigPath(opts.env || process.env);
  await ensureDir(path.dirname(configPath));
  const current = await readText(configPath, '');
  let next = removeLegacyProfileConfig(current, MAD_HIGH_PROFILE);
  next = upsertAutoReviewPolicy(next);
  if (!next.endsWith('\n')) next += '\n';
  await writeTextAtomic(configPath, next);
  await writeProfileConfig(configPath, MAD_HIGH_PROFILE, profileConfigBlock({
    effort: 'high',
    approvalPolicy: 'never',
    sandboxMode: 'danger-full-access'
  }));
  return {
    config_path: configPath,
    profile_config_path: path.join(path.dirname(configPath), `${MAD_HIGH_PROFILE}.config.toml`),
    profile_name: MAD_HIGH_PROFILE,
    launch_args: ['--profile', MAD_HIGH_PROFILE, '--sandbox', 'danger-full-access', '--ask-for-approval', 'never', '-c', 'service_tier=fast'],
    sandbox_mode: 'danger-full-access',
    approval_policy: 'never',
    approvals_reviewer: AUTO_REVIEW_REVIEWER,
    model_reasoning_effort: 'high',
    scope: 'explicit_launch_only'
  };
}

export function madHighProfileName() {
  return MAD_HIGH_PROFILE;
}

export async function disableAutoReview(opts: any = {}) {
  const configPath = opts.configPath || codexConfigPath(opts.env || process.env);
  const current = await readText(configPath, '');
  let next = upsertTopLevelString(current, 'approvals_reviewer', 'user');
  next = removeLegacyProfileConfig(next, AUTO_REVIEW_PROFILE);
  next = removeLegacyProfileConfig(next, AUTO_REVIEW_HIGH_PROFILE);
  if (!next.endsWith('\n')) next += '\n';
  await writeTextAtomic(configPath, next);
  await writeProfileConfig(configPath, AUTO_REVIEW_PROFILE, profileConfigBlock({ effort: 'medium', reviewer: 'user' }));
  await writeProfileConfig(configPath, AUTO_REVIEW_HIGH_PROFILE, profileConfigBlock({ effort: 'high', reviewer: 'user' }));
  return autoReviewStatus({ configPath });
}

export function autoReviewSummary(status: any = {}) {
  const lines = [
    'Codex Auto-Review',
    '',
    `Config:             ${status.config_path || codexConfigPath()}`,
    `Approvals reviewer: ${status.approvals_reviewer || 'unset'}`,
    `Enabled:            ${status.enabled ? 'yes' : 'no'}`,
    `Profile:            ${status.profile ? AUTO_REVIEW_PROFILE : 'missing'}`,
    `High profile:       ${status.high_profile ? AUTO_REVIEW_HIGH_PROFILE : 'missing'}`
  ];
  if (!status.enabled) {
    lines.push('', 'Enable with: sks auto-review enable');
    lines.push('Launch high mode with: sks --Auto-review --high');
  }
  if (status.legacy_invalid) {
    lines.push('', 'Legacy reviewer value found: run sks auto-review enable or sks auto-review disable to rewrite Codex config.');
  }
  return lines.join('\n');
}

function readTomlString(text: any, key: any) {
  const re = new RegExp(`^${escapeRegExp(key)}\\s*=\\s*"([^"]*)"\\s*$`, 'm');
  return text.match(re)?.[1] || null;
}

function readTableString(text: any, table: any, key: any) {
  const body = tableBody(text, table);
  if (!body) return null;
  return readTomlString(body, key);
}

function tableHasString(text: any, table: any, key: any, value: any) {
  return readTableString(text, table, key) === value;
}

function tableBody(text: any, table: any) {
  const lines = String(text || '').split('\n');
  const header = `[${table}]`;
  const out: any[] = [];
  let inTable = false;
  for (const line of lines) {
    if (/^\s*\[.+\]\s*$/.test(line)) {
      if (inTable) break;
      inTable = line.trim() === header;
      continue;
    }
    if (inTable) out.push(line);
  }
  return inTable || out.length ? out.join('\n') : '';
}

function upsertTopLevelString(text: any, key: any, value: any) {
  const line = `${key} = "${value}"`;
  const lines = String(text || '').split('\n');
  const firstTable = lines.findIndex((x: any) => /^\s*\[.+\]\s*$/.test(x));
  const end = firstTable === -1 ? lines.length : firstTable;
  for (let i = 0; i < end; i++) {
    if (new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`).test(lines[i] || '')) {
      lines[i] = line;
      return lines.join('\n').replace(/\n+$/, '\n');
    }
  }
  lines.splice(end, 0, line);
  return lines.join('\n').replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n');
}

function profileConfigBlock(opts: any = {}) {
  const effort = opts.effort || 'medium';
  const reviewer = opts.reviewer || AUTO_REVIEW_REVIEWER;
  const approvalPolicy = opts.approvalPolicy || 'on-request';
  const sandboxMode = opts.sandboxMode || 'workspace-write';
  return [
    'model = "gpt-5.5"',
    'service_tier = "fast"',
    `approval_policy = "${approvalPolicy}"`,
    `approvals_reviewer = "${reviewer}"`,
    `sandbox_mode = "${sandboxMode}"`,
    `model_reasoning_effort = "${effort}"`
  ].join('\n');
}

async function writeProfileConfig(configPath: string, profile: string, text: string) {
  const file = path.join(path.dirname(configPath), `${profile}.config.toml`);
  await writeTextAtomic(file, `${String(text || '').replace(/\s+$/, '')}\n`);
}

function removeLegacyProfileConfig(text: any, profile: any) {
  let next = removeTable(text, `profiles.${profile}`);
  next = removeTopLevelStringIfValue(next, 'profile', profile);
  return next;
}

function upsertAutoReviewPolicy(text: any) {
  const policy = [
    '[auto_review]',
    'policy = "In MAD launches, allow live-server work, normal DB writes, Supabase MCP DB writes, direct execute SQL, schema cleanup, and migration application for the active invocation. Deny only catastrophic database wipes, all-row value deletion/update, dangerous project or branch management, credential exfiltration, persistent security weakening, broad unrelated file deletion, and unrequested fallback implementation code."'
  ].join('\n');
  const existing = readTableString(text, 'auto_review', 'policy');
  if (existing && /unrequested fallback implementation code/i.test(existing)) return text;
  return upsertTable(text, 'auto_review', policy);
}

function upsertTable(text: any, table: any, block: any) {
  const lines = String(text || '').replace(/\s+$/, '').split('\n');
  const header = `[${table}]`;
  const start = lines.findIndex((x: any) => x.trim() === header);
  if (start === -1) {
    return `${lines.filter((x: any, i: any) => i > 0 || x.trim()).join('\n')}${lines.some((x: any) => x.trim()) ? '\n\n' : ''}${block}\n`;
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\[.+\]\s*$/.test(lines[i] || '')) {
      end = i;
      break;
    }
  }
  lines.splice(start, end - start, ...block.split('\n'));
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

function removeTable(text: any, table: any) {
  const lines = String(text || '').replace(/\s+$/, '').split('\n');
  const header = `[${table}]`;
  const start = lines.findIndex((x: any) => x.trim() === header);
  if (start === -1) return String(text || '');
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\[.+\]\s*$/.test(lines[i] || '')) {
      end = i;
      break;
    }
  }
  lines.splice(start, end - start);
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')}\n`;
}

function removeTopLevelStringIfValue(text: any, key: any, value: any) {
  const lines = String(text || '').split('\n');
  const firstTable = lines.findIndex((x: any) => /^\s*\[.+\]\s*$/.test(x));
  const end = firstTable === -1 ? lines.length : firstTable;
  for (let i = 0; i < end; i++) {
    const match = String(lines[i] || '').match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*"([^"]*)"\\s*$`));
    if (match?.[1] === String(value)) {
      lines.splice(i, 1);
      break;
    }
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')}\n`;
}

function escapeRegExp(value: any) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
