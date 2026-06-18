import { parseGlmSpeedOutput } from './glm-speed-output-parser.js';

export interface GlmSpeedGateResult {
  readonly schema: 'sks.glm-speed-gate.v1';
  readonly ok: boolean;
  readonly gate_ms: number;
  readonly deterministic: true;
  readonly checks: readonly GlmSpeedGateCheck[];
  readonly requiresDeepEscalation: boolean;
}

export interface GlmSpeedGateCheck {
  readonly id: string;
  readonly ok: boolean;
  readonly ms: number;
  readonly skipped?: boolean;
  readonly reason?: string;
}

const FORBIDDEN_TOUCHED_PATH = /(^|\/)(\.github|dist|node_modules)(\/|$)/;

export function evaluateGlmSpeedGate(output: string): GlmSpeedGateResult {
  const started = Date.now();
  const checks: GlmSpeedGateCheck[] = [];
  const parsed = parseGlmSpeedOutput(output);
  checks.push(check('patch_parse', parsed.kind === 'patch', parsed.kind === 'patch' ? undefined : parsed.reason || parsed.kind));
  const paths = parsed.kind === 'patch' ? touchedPaths(parsed.content) : [];
  checks.push(check('touched_path_allowlist', paths.every((file) => !FORBIDDEN_TOUCHED_PATH.test(file)), paths.find((file) => FORBIDDEN_TOUCHED_PATH.test(file))));
  checks.push(check('patch_apply_dry_run_ready', parsed.kind === 'patch' && /^diff --git /m.test(parsed.content), parsed.kind === 'patch' ? undefined : 'no_patch'));
  const ok = checks.every((row) => row.ok);
  return {
    schema: 'sks.glm-speed-gate.v1',
    ok,
    gate_ms: Date.now() - started,
    deterministic: true,
    checks,
    requiresDeepEscalation: !ok
  };
}

function touchedPaths(patch: string): string[] {
  const paths: string[] = [];
  for (const line of patch.split(/\r?\n/)) {
    const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (match?.[1]) paths.push(match[1]);
    if (match?.[2]) paths.push(match[2]);
  }
  return [...new Set(paths)];
}

function check(id: string, ok: boolean, reason?: string): GlmSpeedGateCheck {
  return {
    id,
    ok,
    ms: 0,
    ...(reason ? { reason } : {})
  };
}
