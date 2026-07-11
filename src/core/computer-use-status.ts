import { codexAppIntegrationStatus } from './codex-app.js';
import {
  buildComputerUseLiveEvidence,
  computerUseLiveEvidencePath,
  writeComputerUseLiveEvidence
} from './computer-use-live-evidence.js';
export type {
  ComputerUseCaptureAttestation,
  ComputerUseCaptureStatus,
  ComputerUseEvidenceMode,
  ComputerUseLiveEvidence,
  ComputerUseScreenshotCaptureAdapter
} from './computer-use-live-evidence.js';
export { createOfficialCodexComputerUseScreenshotAdapter } from './computer-use-live-evidence.js';

export type ComputerUseStatus =
  | 'available'
  | 'codex_app_missing'
  | 'macos_permission_missing'
  | 'codex_app_capability_missing'
  | 'external_capability_blocked'
  | 'not_macos'
  | 'unknown';

export async function computerUseStatusReport(opts: any = {}) {
  if (process.platform !== 'darwin' && !opts.forceMacos) {
    return baseReport('not_macos', {
      ok: false,
      platform: process.platform,
      guidance: ['Computer Use is a macOS Codex App capability for native/non-web targets. Web/browser/webapp verification must use the Codex Chrome Extension path first.']
    });
  }
  const app: any = await codexAppIntegrationStatus(opts).catch((err: any) => ({ ok: false, error: err.message }));
  if (!app?.app?.installed) {
    return baseReport('codex_app_missing', {
      ok: false,
      platform: process.platform,
      app,
      guidance: ['Install or open Codex App for native Computer Use. For web/browser/webapp verification, run `sks codex-app chrome-extension --json` and set up the Codex Chrome Extension first.']
    });
  }
  if (app?.mcp?.has_computer_use || app?.plugins?.computer_use_cache || app?.features?.computer_use) {
    return baseReport('available', {
      ok: true,
      platform: process.platform,
      source: app?.mcp?.has_computer_use ? 'codex-app-mcp' : app?.plugins?.computer_use_cache ? 'plugin-cache' : 'codex-feature-flag',
      permission_status: 'unknown',
      app,
      guidance: ['Use this only for native Mac/non-web app surfaces. If the OS prompts during live use, grant Screen Recording/Accessibility to Codex App. Web/browser/webapp verification uses the Codex Chrome Extension gate instead.']
    });
  }
  if (app?.features?.checked || app?.mcp?.checked) {
    return baseReport('codex_app_capability_missing', {
      ok: false,
      platform: process.platform,
      app,
      guidance: ['Computer Use capability is not exposed by this Codex App/CLI environment. Do not fabricate native visual evidence. Do not use this blocker to bypass the separate Chrome Extension gate for web verification.']
    });
  }
  return baseReport('unknown', {
    ok: false,
    platform: process.platform,
    app,
    guidance: ['Could not safely determine Computer Use capability; mark native non-web visual evidence unverified until Codex App exposes it. Web verification must use Codex Chrome Extension readiness.']
  });
}

export function computerUseEvidenceSkeleton(status: ComputerUseStatus = 'unknown') {
  return {
    schema: 'sks.computer-use-evidence.v1',
    status,
    source: status === 'available' ? 'codex-app-macos' : null,
    screens: [],
    actions: [],
    image_voxel_linked: false
  };
}

export async function computerUseLiveSmoke(opts: any = {}) {
  const realOptIn = opts.real === true || process.env.SKS_TEST_REAL_COMPUTER_USE === '1';
  const requireReal = opts.requireReal === true;
  const captureScreenshot = opts.captureScreenshot === true || requireReal;
  const status = await computerUseStatusReport(opts);
  const root = opts.root || process.cwd();
  const evidencePath = opts.evidencePath || (realOptIn ? computerUseLiveEvidencePath(root, { missionId: opts.missionId || null }) : null);
  const liveEvidence = realOptIn
    ? await buildComputerUseLiveEvidence({
      root,
      route: opts.route || null,
      missionId: opts.missionId || null,
      statusReport: status,
      realOptIn,
      captureScreenshot,
      allowAction: opts.allowAction === true,
      screenshotAdapter: opts.screenshotAdapter || null,
      capabilityAdapter: opts.capabilityAdapter || null,
      evidencePath
    })
    : null;
  if (liveEvidence && evidencePath) await writeComputerUseLiveEvidence(evidencePath, liveEvidence);
  const evidenceMode = liveEvidence?.mode || 'probe_only';
  const adapterAttested = liveEvidence?.capture?.screenshot?.adapter_provenance?.verified === true;
  const liveCaptureSuccess = evidenceMode === 'live_capture_success' && adapterAttested;
  const blockers = [...(liveEvidence?.blockers || [])];
  if (!realOptIn && status.status === 'not_macos') blockers.push('not_macos');
  const warnings = [...(liveEvidence?.warnings || [])];
  const ok = requireReal ? liveCaptureSuccess : true;
  const smoke = {
    schema: 'sks.computer-use-live-smoke.v2',
    ok,
    mode: evidenceMode,
    evidence_mode: evidenceMode,
    status: status.status,
    platform: status.platform || process.platform,
    codex_app: {
      installed: Boolean(status.app?.app?.installed),
      capability_detected: status.status === 'available'
    },
    permission: {
      screen_recording: status.permission_status || 'unknown',
      accessibility: 'unknown'
    },
    live_evidence_path: liveEvidence && evidencePath ? evidencePath : null,
    image_voxel_linked: liveEvidence?.image_voxel?.linked === true,
    blockers,
    warnings,
    evidence: {
      screenshot_captured: liveEvidence?.capture?.screenshot?.status === 'captured' && adapterAttested,
      official_adapter_attested: adapterAttested,
      action_captured: liveEvidence?.capture?.action?.status === 'captured',
      image_voxel_linked: liveEvidence?.image_voxel?.linked === true,
      evidence_path: liveEvidence && evidencePath ? evidencePath : null
    },
    live_evidence: liveEvidence,
    external_capability_blocked: status.external_capability_blocked === true || ['codex_app_missing', 'macos_permission_missing', 'codex_app_capability_missing', 'unknown'].includes(status.status),
    mock: false,
    guidance: status.status === 'available' && realOptIn
      ? ['Computer Use capability appears available. SKS records only official, local-only live evidence and does not synthesize screenshots.']
      : status.guidance || []
  };
  return smoke;
}

function baseReport(status: ComputerUseStatus, extra: any = {}) {
  return {
    schema: 'sks.computer-use-status.v1',
    status,
    mad_sks_independent: true,
    safety_policy_blocked: false,
    external_capability_blocked: status === 'external_capability_blocked',
    ...extra,
    evidence: computerUseEvidenceSkeleton(status)
  };
}
