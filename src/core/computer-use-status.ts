import { codexAppIntegrationStatus } from './codex-app.js';

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
      guidance: ['Computer Use is a macOS Codex App capability; mark UI evidence unverified on this platform.']
    });
  }
  const app: any = await codexAppIntegrationStatus(opts).catch((err: any) => ({ ok: false, error: err.message }));
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
