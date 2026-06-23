import { projectRoot } from '../fsx.js';
import { codexVersionReport } from './codex-version.js';
import { CODEX_COMPAT_SCHEMA, CODEX_HOOK_SCHEMA_BASELINE_TAG, CODEX_REQUIRED_BASELINE_TAG } from './codex-version-policy.js';
import { codexReleaseManifestParity } from './codex-release-manifest.js';
import { codexSchemaSnapshotReport } from './codex-schema-snapshot.js';
import { codexHookWarningCheck } from './codex-hook-warning-detector.js';
import { codex0133Matrix } from './codex-0-133.js';
import { detectCodexExecResumeOutputSchema } from '../codex-exec-output-schema.js';
import { collectCodex0134LocalEvidence, codex0134Matrix } from '../codex/codex-0-134-compat.js';
import { collectCodex0135LocalEvidence, codex0135Matrix } from '../codex/codex-0-135-compat.js';
import { collectCodex0136LocalEvidence, codex0136Matrix } from '../codex/codex-0-136-compat.js';

export async function codexCompatibilityReport(opts: any = {}) {
  const root = opts.root || await projectRoot();
  const version = await codexVersionReport(opts);
  const releaseManifest = await codexReleaseManifestParity(root).catch((err: any) => ({
    ok: false,
    mismatches: ['manifest_load_failed'],
    manifest: null,
    manifest_path: null,
    manifest_sha256: null,
    error: err?.message || String(err)
  }));
  const snapshot = await codexSchemaSnapshotReport();
  const hooks = await codexHookWarningCheck(root, { recordWrongness: false });
  const outputSchema = await detectCodexExecResumeOutputSchema(opts).catch((err: any) => ({
    status: 'integration_optional',
    output_schema_supported: false,
    warnings: [`codex output-schema detector failed: ${err.message}`]
  }));
  const local0134 = await collectCodex0134LocalEvidence(opts).catch((err: any) => ({
    available: false,
    versionText: '',
    execHelp: '',
    mcpHelp: '',
    historyHelp: '',
    historyCommandAvailable: false,
    schemaPolicyText: '',
    warnings: [`codex 0.134 local evidence failed: ${err.message}`]
  }));
  const local0135 = await collectCodex0135LocalEvidence(opts).catch((err: any) => ({
    available: false,
    versionText: '',
    doctorText: '',
    permissionsText: '',
    execHelp: '',
    resumeHelp: '',
    warnings: [`codex 0.135 local evidence failed: ${err.message}`]
  }));
  const local0136 = await collectCodex0136LocalEvidence(opts).catch((err: any) => ({
    available: false,
    versionText: '',
    doctorText: '',
    archiveHelp: '',
    unarchiveHelp: '',
    appServerHelp: '',
    sandboxSetupHelp: '',
    remoteControlHelp: '',
    warnings: [`codex 0.136 local evidence failed: ${err.message}`]
  }));
  const matrix0136 = codex0136Matrix({
    version: version.detected?.version || local0136.versionText,
    available: version.detected?.available || local0136.available,
    doctorText: local0136.doctorText,
    archiveHelp: local0136.archiveHelp,
    unarchiveHelp: local0136.unarchiveHelp,
    appServerHelp: local0136.appServerHelp,
    sandboxSetupHelp: local0136.sandboxSetupHelp,
    remoteControlHelp: local0136.remoteControlHelp
  });
  const matrix0135 = codex0135Matrix({
    version: version.detected?.version || local0135.versionText,
    available: version.detected?.available || local0135.available,
    doctorText: local0135.doctorText,
    permissionsText: local0135.permissionsText,
    execHelp: local0135.execHelp,
    resumeHelp: local0135.resumeHelp
  });
  const matrix0134 = codex0134Matrix({
    version: version.detected?.version || local0134.versionText,
    available: version.detected?.available || local0134.available,
    execHelp: local0134.execHelp,
    mcpHelp: local0134.mcpHelp,
    historyHelp: local0134.historyHelp,
    historyCommandAvailable: local0134.historyCommandAvailable,
    schemaPolicyText: local0134.schemaPolicyText
  });
  const matrix0133 = codex0133Matrix({
    version: version.detected?.version,
    available: version.detected?.available,
    execResumeHelp: outputSchema.output_schema_supported ? '--output-schema' : ''
  });
  const ok = Boolean(version.policy.ok && releaseManifest.ok && snapshot.ok && hooks.ok && matrix0136.ok && matrix0135.ok && matrix0134.ok);
  return {
    schema: CODEX_COMPAT_SCHEMA,
    required_baseline: opts.requiredBaseline || opts.require || CODEX_REQUIRED_BASELINE_TAG,
    release_manifest: releaseManifest,
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
    capabilities: matrix0136.capabilities,
    codex_0_136: matrix0136,
    codex_0_135: matrix0135,
    codex_0_134: matrix0134,
    codex_0_133: matrix0133,
    legacy_baselines: {
      codex_0_135: {
        baseline: 'rust-v0.135.0',
        status: 'inherited',
        superseded_by: matrix0136.baseline
      },
      codex_0_134: {
        baseline: 'rust-v0.134.0',
        status: 'inherited',
        superseded_by: matrix0136.baseline
      },
      codex_0_133: {
        baseline: 'rust-v0.133.0',
        status: 'superseded',
        superseded_by: matrix0136.baseline
      },
      codex_0_132: {
        baseline: 'rust-v0.132.0',
        status: 'superseded',
        superseded_by: matrix0136.baseline
      }
    },
    local_codex_0_136_evidence: local0136,
    local_codex_0_135_evidence: local0135,
    local_codex_0_134_evidence: local0134,
    structured_resume_output: outputSchema,
    session_archive_supported: matrix0136.session_archive_supported,
    app_server_stdio_supported: matrix0136.app_server_stdio_supported,
    remote_api_key_registration_supported: matrix0136.remote_api_key_registration_supported,
    command_safety_hardening_supported: matrix0136.command_safety_hardening_supported,
    profile_primary_selector: matrix0134.profile_primary_selector,
    local_history_search_supported: matrix0134.local_history_search_supported,
    mcp_0_134_modernization_supported: matrix0134.mcp_0_134_modernization_supported,
    managed_proxy_env_supported: matrix0134.managed_proxy_env_supported,
    ux_review_output_schema_preferred: matrix0133.ux_review_output_schema_preferred,
    ok,
    status: ok ? version.policy.status : 'blocked',
    warnings: [
      ...version.policy.warnings,
      ...(local0136.warnings || []),
      ...(local0135.warnings || []),
      ...(local0134.warnings || []),
      ...(matrix0136.warnings || []),
      ...(matrix0135.warnings || []),
      ...(matrix0134.blockers || []),
      ...(outputSchema.warnings || []),
      ...(hooks.ok ? [] : hooks.warnings)
    ],
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
