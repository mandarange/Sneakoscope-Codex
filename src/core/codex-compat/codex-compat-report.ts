import { projectRoot } from '../fsx.js';
import { codexVersionReport } from './codex-version.js';
import { CODEX_COMPAT_SCHEMA, CODEX_HOOK_SCHEMA_BASELINE_TAG, CODEX_REQUIRED_BASELINE_TAG } from './codex-version-policy.js';
import { codexSchemaSnapshotReport } from './codex-schema-snapshot.js';
import { codexHookWarningCheck } from './codex-hook-warning-detector.js';
import { codex0133Matrix } from './codex-0-133.js';
import { detectCodexExecResumeOutputSchema } from '../codex-exec-output-schema.js';

export async function codexCompatibilityReport(opts: any = {}) {
  const root = opts.root || await projectRoot();
  const version = await codexVersionReport(opts);
  const snapshot = await codexSchemaSnapshotReport();
  const hooks = await codexHookWarningCheck(root, { recordWrongness: false });
  const outputSchema = await detectCodexExecResumeOutputSchema(opts).catch((err: any) => ({
    status: 'integration_optional',
    output_schema_supported: false,
    warnings: [`codex output-schema detector failed: ${err.message}`]
  }));
  const matrix = codex0133Matrix({
    version: version.detected?.version,
    available: version.detected?.available,
    execResumeHelp: outputSchema.output_schema_supported ? '--output-schema' : ''
  });
  const ok = Boolean(version.policy.ok && snapshot.ok && hooks.ok);
  return {
    schema: CODEX_COMPAT_SCHEMA,
    required_baseline: CODEX_REQUIRED_BASELINE_TAG,
    detected: version.detected,
    hooks_schema: {
      snapshot: CODEX_HOOK_SCHEMA_BASELINE_TAG,
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
      issues_by_category: hooks.issues_by_category,
      events: hooks.events
    },
    capabilities: matrix.capabilities,
    codex_0_133: matrix,
    legacy_baselines: {
      codex_0_132: {
        baseline: 'rust-v0.132.0',
        status: 'superseded',
        superseded_by: matrix.baseline
      }
    },
    structured_resume_output: outputSchema,
    ux_review_output_schema_preferred: matrix.ux_review_output_schema_preferred,
    ok,
    status: ok ? version.policy.status : 'blocked',
    warnings: [...version.policy.warnings, ...(outputSchema.warnings || []), ...(hooks.ok ? [] : hooks.warnings)],
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
