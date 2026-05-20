import { codexAppIntegrationStatus } from './codex-app.mjs';

export async function computerUseStatusReport(opts = {}) {
  if (process.platform !== 'darwin' && !opts.forceMacos) {
    return baseReport('not_macos', {
      ok: false,
      platform: process.platform,
      guidance: ['Computer Use is a macOS Codex App capability; mark UI evidence unverified on this platform.']
    });
  }
  const app = await codexAppIntegrationStatus(opts).catch((err) => ({ ok: false, error: err.message }));
  if (!app?.app?.installed) {
    return baseReport('codex_app_missing', {
      ok: false,
      platform: process.platform,
      app,
      guidance: ['Install or open Codex App, then run `sks computer-use status --json` again.']
    });
  }
  if (app?.mcp?.has_computer_use || app?.plugins?.computer_use_cache || app?.features?.computer_use) {
    return baseReport('available', {
      ok: true,
      platform: process.platform,
      source: app?.mcp?.has_computer_use ? 'codex-app-mcp' : app?.plugins?.computer_use_cache ? 'plugin-cache' : 'codex-feature-flag',
      permission_status: 'unknown',
      app,
      guidance: ['If the OS prompts during live use, grant Screen Recording/Accessibility to Codex App.']
    });
  }
  if (app?.features?.checked || app?.mcp?.checked) {
    return baseReport('codex_app_capability_missing', {
      ok: false,
      platform: process.platform,
      app,
      guidance: ['Computer Use capability is not exposed by this Codex App/CLI environment. Do not fabricate UI evidence.']
    });
  }
  return baseReport('unknown', {
    ok: false,
    platform: process.platform,
    app,
    guidance: ['Could not safely determine Computer Use capability; mark live UI evidence unverified until Codex App exposes it.']
  });
}

export function computerUseEvidenceSkeleton(status = 'unknown') {
  return {
    schema: 'sks.computer-use-evidence.v1',
    status,
    source: status === 'available' ? 'codex-app-macos' : null,
    screens: [],
    actions: [],
    image_voxel_linked: false
  };
}

export async function computerUseLiveSmoke(opts = {}) {
  const realOptIn = opts.real === true || process.env.SKS_TEST_REAL_COMPUTER_USE === '1';
  const requireReal = opts.requireReal === true;
  const status = await computerUseStatusReport(opts);
  const available = status.status === 'available';
  const realAllowed = realOptIn && available;
  const evidencePath = opts.evidencePath || null;
  const smoke = {
    schema: 'sks.computer-use-live-smoke.v1',
    ok: realAllowed || !requireReal,
    mode: realOptIn ? 'optional_real' : 'optional_probe',
    status: status.status,
    platform: status.platform || process.platform,
    codex_app: {
      installed: Boolean(status.app?.app?.installed),
      capability_detected: available
    },
    permission: {
      screen_recording: status.permission_status || 'unknown',
      accessibility: 'unknown'
    },
    evidence: {
      screenshot_captured: false,
      action_captured: false,
      image_voxel_linked: false,
      evidence_path: evidencePath
    },
    external_capability_blocked: status.external_capability_blocked === true || ['codex_app_missing', 'macos_permission_missing', 'codex_app_capability_missing', 'unknown'].includes(status.status),
    mock: false,
    guidance: realAllowed
      ? ['Computer Use capability appears available. Capture screenshots through official Codex Computer Use in the active route; SKS smoke does not synthesize evidence.']
      : status.guidance || []
  };
  if (available && realOptIn && evidencePath) {
    const { writeJsonAtomic } = await import('./fsx.mjs');
    await writeJsonAtomic(evidencePath, smoke);
  }
  return smoke;
}

function baseReport(status, extra = {}) {
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
