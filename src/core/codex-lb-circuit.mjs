import path from 'node:path';
import os from 'node:os';
import { ensureDir, nowIso, packageRoot, readJson, writeJsonAtomic } from './fsx.mjs';
import { redactSecrets } from './secret-redaction.mjs';

export const CODEX_LB_CIRCUIT_SCHEMA = 'sks.codex-lb-circuit.v1';

export function codexLbGlobalHealthPath() {
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
  const current = await readCodexLbCircuit(root);
  const recent = [...(current.recent_failures || []), redactSecrets({ ts: nowIso(), ...failure })].slice(-10);
  const open = recent.filter((item) => ['5xx', 'timeout', 'network'].includes(item.kind)).length >= 3
    || recent.some((item) => item.kind === 'auth');
  return writeCodexLbCircuit(root, {
    ...current,
    state: open ? 'open' : current.state || 'closed',
    recent_failures: recent,
    last_failure_at: nowIso()
  });
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

function emptyCircuit() {
  return {
    schema: CODEX_LB_CIRCUIT_SCHEMA,
    base_url: null,
    state: 'closed',
    recent_failures: [],
    latency_ms: { p50: null, p95: null },
    last_ok_at: null,
    last_failure_at: null,
    updated_at: nowIso()
  };
}

function normalizeCircuit(input = {}, root = packageRoot()) {
  const failures = Array.isArray(input.recent_failures) ? input.recent_failures.slice(-10).map((item) => redactSecrets(item)) : [];
  return {
    ...emptyCircuit(),
    ...redactSecrets(input),
    schema: CODEX_LB_CIRCUIT_SCHEMA,
    state: ['closed', 'open', 'half_open'].includes(input.state) ? input.state : 'closed',
    recent_failures: failures,
    report_path: codexLbReportPath(root),
    updated_at: nowIso()
  };
}
