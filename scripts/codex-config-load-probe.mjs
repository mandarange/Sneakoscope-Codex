#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const root = path.resolve(readOption('--root', process.cwd()));
const configPath = path.resolve(readOption('--config', path.join(root, '.codex', 'config.toml')));
const json = args.includes('--json');
const actualRequested = args.includes('--actual-codex')
  || process.env.SKS_TEST_REAL_CODEX_CONFIG_LOAD === '1'
  || Boolean(readOption('--codex-bin', ''));
const actualRequired = args.includes('--require-actual-codex')
  || process.env.SKS_REQUIRE_REAL_CODEX_CONFIG_LOAD === '1';
const codexBin = readOption('--codex-bin', process.env.SKS_CODEX_CONFIG_PROBE_BIN || 'codex');
const outputLastMessage = path.resolve(readOption(
  '--output-last-message',
  path.join(root, '.sneakoscope', 'reports', 'codex-config-load-probe-output.json')
));

const report = {
  schema: 'sks.codex-config-load-probe.v2',
  generated_at: new Date().toISOString(),
  root,
  config_path: configPath,
  ok: false,
  checks: [],
  blockers: [],
  warnings: [],
  integration_optional: !actualRequired,
  actual_codex_requested: actualRequested,
  actual_codex_required: actualRequired
};

await check('node_read', async () => {
  const text = await fs.readFile(configPath, 'utf8');
  return { bytes: Buffer.byteLength(text) };
});

const child = spawnSync(process.execPath, ['-e', 'require("fs").readFileSync(process.argv[1], "utf8")', configPath], {
  cwd: root,
  encoding: 'utf8'
});
pushCheck({
  name: 'spawned_node_child_read',
  ok: child.status === 0,
  exit_code: child.status,
  stdout_tail: tail(child.stdout),
  stderr_tail: tail(child.stderr),
  signals: classifyText(`${child.stderr}\n${child.stdout}`)
});

if (actualRequested) {
  await fs.mkdir(path.dirname(outputLastMessage), { recursive: true }).catch(() => {});
  await fs.rm(outputLastMessage, { force: true }).catch(() => {});
  const codexArgs = [
    'exec',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--ignore-rules',
    '--output-last-message',
    outputLastMessage,
    'Reply exactly SKS_CONFIG_LOAD_PROBE_OK.'
  ];
  const command = commandForCodex(codexBin, codexArgs);
  const result = spawnSync(command.command, command.args, {
    cwd: root,
    env: probeEnv(process.env),
    encoding: 'utf8',
    timeout: Number(process.env.SKS_CODEX_CONFIG_LOAD_TIMEOUT_MS || 20000),
    maxBuffer: 1024 * 1024
  });
  const outputLastText = await readTextIfExists(outputLastMessage);
  const observedText = `${result.stderr || ''}\n${result.stdout || ''}\n${outputLastText || ''}`;
  const probeOkObserved = /SKS_CONFIG_LOAD_PROBE_OK/.test(observedText);
  const signals = classifyText(observedText, { configLoaded: probeOkObserved });
  const configFailure = signals.blockers.length > 0;
  const unavailable = result.error?.code === 'ENOENT';
  const timeoutAfterProbeOk = result.error?.code === 'ETIMEDOUT' && probeOkObserved;
  const executionError = Boolean(result.error) && !timeoutAfterProbeOk;
  const nonConfigFailure = (result.status !== 0 || executionError) && !configFailure && !unavailable;
  const passed = (result.status === 0 && !executionError) || (probeOkObserved && !configFailure);
  pushCheck({
    name: 'actual_codex_cli_config_load',
    ok: passed,
    status: passed
      ? timeoutAfterProbeOk
        ? 'passed_after_probe_ok_timeout'
        : 'passed'
      : unavailable
        ? 'integration_optional_unavailable'
        : configFailure
          ? 'failed_config_load'
          : 'non_config_failure_after_config_load',
    integration_optional: !actualRequired && (unavailable || nonConfigFailure),
    exit_code: result.status,
    signal: result.signal,
    error: result.error ? { code: result.error.code, message: result.error.message } : null,
    command: {
      executable: redact(codexBin),
      args: codexArgs.map(redact)
    },
    env_keys: Object.keys(probeEnv(process.env)).sort(),
    stdout_tail: tail(result.stdout),
    stderr_tail: tail(result.stderr),
    output_last_message: outputLastMessage,
    output_last_message_tail: tail(outputLastText),
    probe_ok_observed: probeOkObserved,
    signals
  });
} else {
  pushCheck({
    name: 'actual_codex_cli_config_load',
    ok: true,
    status: 'integration_optional_not_requested',
    integration_optional: true,
    command: { executable: redact(codexBin), args: [] },
    signals: { blockers: [], flags: {} }
  });
}

report.ok = report.checks.every((check) => {
  if (check.ok) return true;
  return check.integration_optional === true && !actualRequired;
}) && report.blockers.length === 0;

if (json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(report.ok
    ? `Codex config load probe ok: ${configPath}`
    : `Codex config load probe failed: ${report.blockers.join(', ')}`);
}
if (!report.ok) process.exitCode = 1;

async function check(name, fn) {
  try {
    pushCheck({ name, ok: true, detail: await fn(), signals: { blockers: [], flags: {} } });
  } catch (err) {
    const signals = classifyText(`${err?.code || ''}\n${err?.message || String(err)}`);
    pushCheck({
      name,
      ok: false,
      error: { code: err?.code || '', message: err?.message || String(err) },
      signals
    });
  }
}

function pushCheck(check) {
  report.checks.push(check);
  for (const warning of check.signals?.warnings || []) {
    if (!report.warnings.includes(warning)) report.warnings.push(warning);
  }
  if (check.ok) return;
  for (const blocker of check.signals?.blockers || classifyText(`${check.stderr_tail || ''}\n${check.error?.message || ''}`).blockers) {
    if (!report.blockers.includes(blocker)) report.blockers.push(blocker);
  }
  if (!check.integration_optional && check.name === 'actual_codex_cli_config_load' && !check.signals?.blockers?.length) {
    if (!report.blockers.includes('codex_cli_config_load_unverified')) report.blockers.push('codex_cli_config_load_unverified');
  }
}

function classifyText(textInput, opts = {}) {
  const text = String(textInput || '');
  const flags = {
    error_loading_config_toml: /Error loading config\.toml/i.test(text),
    operation_not_permitted: /Operation not permitted|os error 1|EPERM/i.test(text),
    permission_denied: /Permission denied|EACCES/i.test(text),
    toml_parse: /TOML parse|toml.*parse|parse.*toml|invalid.*toml|duplicate key/i.test(text),
    untrusted_project: /untrusted project/i.test(text),
    ignored_project_local_config_key: /ignored project-local config key|ignored.*project.*config/i.test(text)
  };
  const blockers = [];
  const warnings = [];
  if (flags.operation_not_permitted || (flags.error_loading_config_toml && /os error 1/i.test(text))) blockers.push('codex_cli_config_eperm');
  else if (flags.permission_denied) blockers.push('codex_cli_config_permission_denied');
  if (flags.toml_parse) blockers.push('codex_cli_config_toml_parse_error');
  if (flags.untrusted_project) blockers.push('codex_cli_untrusted_project');
  if (flags.ignored_project_local_config_key) {
    if (opts.configLoaded) warnings.push('codex_cli_ignored_project_local_config_key');
    else blockers.push('codex_cli_ignored_project_local_config_key');
  }
  return { blockers: [...new Set(blockers)], warnings: [...new Set(warnings)], flags };
}

function commandForCodex(bin, codexArgs) {
  if (/\.mjs$/i.test(String(bin))) return { command: process.execPath, args: [bin, ...codexArgs] };
  return { command: bin, args: codexArgs };
}

function probeEnv(env) {
  const keys = [
    'CODEX_HOME',
    'SKS_FAST_MODE',
    'SKS_SERVICE_TIER',
    'PATH',
    'HOME',
    'WARP_SESSION_ID',
    'TMUX'
  ];
  const out = {};
  for (const key of keys) {
    if (env[key] !== undefined) out[key] = env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    if (/^(CODEX_LB|SKS_CODEX_LB)_/.test(key)) out[key] = value;
    if (/^SKS_FAKE_CODEX_CONFIG_/.test(key)) out[key] = value;
  }
  return out;
}

function redact(value) {
  return String(value || '')
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[REDACTED_OPENAI_KEY]')
    .replace(/github_pat_[A-Za-z0-9_]+/g, '[REDACTED_GITHUB_PAT]')
    .replace(/(CODEX_LB_API_KEY=)[^\s]+/g, '$1[REDACTED]')
    .replace(/(OPENAI_API_KEY=)[^\s]+/g, '$1[REDACTED]');
}

function tail(value, limit = 4000) {
  const text = redact(String(value || ''));
  return text.length <= limit ? text : text.slice(-limit);
}

async function readTextIfExists(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return '';
  }
}

function readOption(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}
