import { projectRoot } from '../fsx.js';
import { codexVersionReport } from './codex-version.js';
import { CODEX_COMPAT_SCHEMA, CODEX_REQUIRED_BASELINE_TAG } from './codex-version-policy.js';
import { codexSchemaSnapshotReport } from './codex-schema-snapshot.js';
import { codexHookWarningCheck } from './codex-hook-warning-detector.js';

export async function codexCompatibilityReport(opts: any = {}) {
  const root = opts.root || await projectRoot();
  const version = await codexVersionReport(opts);
  const snapshot = await codexSchemaSnapshotReport();
  const hooks = await codexHookWarningCheck(root, { recordWrongness: false });
  const ok = Boolean(version.policy.ok && snapshot.ok && hooks.ok);
  return {
    schema: CODEX_COMPAT_SCHEMA,
    required_baseline: CODEX_REQUIRED_BASELINE_TAG,
    detected: version.detected,
    hooks_schema: {
      snapshot: CODEX_REQUIRED_BASELINE_TAG,
      ok: snapshot.ok,
      files: snapshot.files.length,
      metadata: {
        upstream: snapshot.metadata?.upstream || null,
        tag: snapshot.metadata?.tag || null,
        commit: snapshot.metadata?.commit || null,
        captured_at: snapshot.metadata?.captured_at || null
      }
    },
    hooks_semantic: {
      ok: hooks.ok,
      warnings_count: hooks.warnings_count,
      events: hooks.events
    },
    ok,
    status: ok ? version.policy.status : 'blocked',
    warnings: [...version.policy.warnings, ...(hooks.ok ? [] : hooks.warnings)],
    root
  };
}

export async function codexDoctorReport(opts: any = {}) {
  const root = opts.root || await projectRoot();
  const compatibility = await codexCompatibilityReport({ ...opts, root });
  const hooks = await codexHookWarningCheck(root, { recordWrongness: false });
  const ok = compatibility.ok && hooks.ok;
  return {
    schema: 'sks.codex-doctor.v1',
    ok,
    compatibility,
    hooks
  };
}
