import path from 'node:path';
import os from 'node:os';
import { ensureDir, nowIso, packageRoot, readJson, writeJsonAtomic } from './fsx.mjs';
import { redactSecrets } from './secret-redaction.mjs';

export const CODEX_LB_CIRCUIT_SCHEMA = 'sks.codex-lb-circuit.v1';

export function codexLbGlobalHealthPath() {
  if (process.env.SKS_CODEX_LB_HEALTH_PATH) return process.env.SKS_CODEX_LB_HEALTH_PATH;
  return path.join(os.homedir(), '.codex', 'sks-codex-lb-health.json');
}

export function codexLbReportPath(root = packageRoot()) {
  return path.join(root, '.sneakoscope', 'reports', 'codex-lb-health.json');
}

export async function readCodexLbCircuit(root = packageRoot()) {
  const record = await readJson(codexLbGlobalHealthPath(), null).catch(() => null);
  return normalizeCircuit(record || {}, root);
}

export async function writeCodexLbCircuit(root = packageRoot(), circuit = {}) {
  const normalized = normalizeCircuit(circuit, root);
  await ensureDir(path.dirname(codexLbGlobalHealthPath()));
  await ensureDir(path.dirname(codexLbReportPath(root)));
  await writeJsonAtomic(codexLbGlobalHealthPath(), normalized);
  await writeJsonAtomic(codexLbReportPath(root), normalized);
  return normalized;
}

export async function resetCodexLbCircuit(root = packageRoot()) {
  return writeCodexLbCircuit(root, emptyCircuit());
}

export async function recordCodexLbFailure(root = packageRoot(), failure = {}) {
  return recordCodexLbHealthEvent(root, failure);
}

export async function recordCodexLbHealthEvent(root = packageRoot(), event = {}) {
  const current = await readCodexLbCircuit(root);
  const normalized = normalizeHealthEvent(event);
  if (normalized.kind === 'chain_ok') {
    return writeCodexLbCircuit(root, {
      ...current,
      state: current.state === 'half_open' || current.state === 'open' ? 'closed' : current.state || 'closed',
      last_ok_at: nowIso(),
      recent_failures: current.recent_failures || []
    });
  }
  if (normalized.kind === 'previous_response_not_found') {
    const warnings = [...(current.recent_warnings || []), redactSecrets({ ts: nowIso(), ...normalized })].slice(-10);
    return writeCodexLbCircuit(root, {
      ...current,
      state: current.state === 'open' ? 'open' : 'closed',
      recent_warnings: warnings,
      last_warning_at: nowIso()
    });
  }
  const recent = [...(current.recent_failures || []), redactSecrets({ ts: nowIso(), ...normalized })].slice(-10);
  const open = recent.filter((item) => ['5xx', 'timeout', 'network'].includes(item.kind)).length >= 3
    || recent.some((item) => item.kind === 'auth');
  return writeCodexLbCircuit(root, {
    ...current,
    state: open ? 'open' : current.state || 'closed',
    recent_failures: recent,
    last_failure_at: nowIso()
  });
}

export function normalizeHealthEvent(event = {}) {
  const status = String(event.status || event.kind || '').toLowerCase();
  const httpStatus = Number(event.http_status || event.httpStatus || 0);
  let kind = event.kind || status || 'unknown';
  if (status === 'chain_ok' || event.ok === true) kind = 'chain_ok';
  else if (status === 'previous_response_not_found') kind = 'previous_response_not_found';
  else if (status === 'missing_env_key') kind = 'missing_env_key';
  else if (status === 'missing_base_url') kind = 'missing_base_url';
  else if (/auth|401|403/.test(status) || httpStatus === 401 || httpStatus === 403) kind = 'auth';
  else if (/timeout|timed out/.test(status) || /timeout|timed out/i.test(event.error || '')) kind = 'timeout';
  else if (httpStatus >= 500 || /5xx|server/.test(status)) kind = '5xx';
  else if (/network|fetch|econn|enotfound|socket/.test(status) || /network|fetch|econn|enotfound|socket/i.test(event.error || '')) kind = 'network';
  else if (status === 'first_request_failed') kind = httpStatus >= 500 ? '5xx' : 'network';
  else if (status === 'second_request_failed') kind = httpStatus >= 500 ? '5xx' : 'network';
  return redactSecrets({ ...event, kind });
}

export function codexLbMetrics(circuit = emptyCircuit()) {
  return {
    schema: 'sks.codex-lb-metrics.v1',
    ok: circuit.state !== 'open',
    circuit,
    policy: {
      previous_response_not_found: 'stateless_lb_warning',
      auth_rejected: 'hard_failure',
      repeated_5xx: 'circuit_open',
      repeated_timeout: 'circuit_open',
      explicit_bypass: 'env_opt_in_only'
    }
  };
}

export async function codexLbProofEvidence(root = packageRoot()) {
  const circuit = await readCodexLbCircuit(root);
  const metrics = codexLbMetrics(circuit);
  return {
    schema: 'sks.codex-lb-proof-evidence.v1',
    ok: metrics.ok,
    status: circuit.state === 'open' ? 'blocked' : 'verified_partial',
    circuit_state: circuit.state,
    report_path: codexLbReportPath(root),
    last_ok_at: circuit.last_ok_at,
    last_failure_at: circuit.last_failure_at,
    last_warning_at: circuit.last_warning_at,
    recent_failures: circuit.recent_failures?.length || 0,
    recent_warnings: circuit.recent_warnings?.length || 0,
    policy: metrics.policy
  };
}

function emptyCircuit() {
  return {
    schema: CODEX_LB_CIRCUIT_SCHEMA,
    base_url: null,
    state: 'closed',
    recent_failures: [],
    recent_warnings: [],
    latency_ms: { p50: null, p95: null },
    last_ok_at: null,
    last_failure_at: null,
    last_warning_at: null,
    updated_at: nowIso()
  };
}

function normalizeCircuit(input = {}, root = packageRoot()) {
  const failures = Array.isArray(input.recent_failures) ? input.recent_failures.slice(-10).map((item) => redactSecrets(item)) : [];
  const warnings = Array.isArray(input.recent_warnings) ? input.recent_warnings.slice(-10).map((item) => redactSecrets(item)) : [];
  return {
    ...emptyCircuit(),
    ...redactSecrets(input),
    schema: CODEX_LB_CIRCUIT_SCHEMA,
    state: ['closed', 'open', 'half_open'].includes(input.state) ? input.state : 'closed',
    recent_failures: failures,
    recent_warnings: warnings,
    report_path: codexLbReportPath(root),
    updated_at: nowIso()
  };
}
