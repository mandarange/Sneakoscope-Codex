import {
  CODEX_APP_SERVER_DOC_URL,
  CODEX_CHROME_EXTENSION_DOC_URL,
  CODEX_COMPUTER_USE_DOC_URL,
  CODEX_IN_APP_BROWSER_DOC_URL,
  type QaInteractionSurface
} from '../routes.js';
import { nowIso } from '../fsx.js';
import type { QaAuthMode, QaContractV2, QaSurfaceSelection, QaTargetKind } from './qa-types.js';

export interface QaSurfaceRouterInput {
  readonly missionId?: string | null;
  readonly prompt?: string | null;
  readonly targetUrl?: string | null;
  readonly uiRequired?: boolean;
  readonly authMode?: QaAuthMode | null;
  readonly requestedSurface?: QaInteractionSurface | 'auto' | null;
  readonly targetKind?: QaTargetKind | null;
}

export function inferQaTargetKind(input: Pick<QaSurfaceRouterInput, 'prompt' | 'targetUrl' | 'authMode'>): QaTargetKind {
  const prompt = String(input.prompt || '').toLowerCase();
  const url = String(input.targetUrl || '').trim();
  if (/(native|desktop|macos|windows|os\s*setting|system settings|finder|xcode|appname|@computer|@appname|네이티브|데스크톱|운영체제|설정)/i.test(prompt)) {
    return /(multi[- ]?app|cross[- ]?app|여러\s*앱|앱\s*간)/i.test(prompt) ? 'cross_app_gui' : 'native_gui';
  }
  if (input.authMode === 'existing_browser_profile' || /(signed[- ]?in|logged[- ]?in|cookie|profile|extension|internal tool|sso|로그인|쿠키|프로필|확장)/i.test(prompt)) {
    return 'signed_in_web';
  }
  if (/^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(url) || /^file:\/\//i.test(url)) return 'local_web';
  if (/^https?:\/\//i.test(url)) return 'public_web';
  if (/(database|mcp|plugin|spreadsheet|notion|gmail|slack|data sync|structured data|데이터|플러그인)/i.test(prompt)) return 'structured_data';
  if (/(api|endpoint|cli|shell|command|엔드포인트|명령어)/i.test(prompt)) return 'api_or_shell';
  return 'local_web';
}

export function selectQaSurface(input: QaSurfaceRouterInput): QaSurfaceSelection {
  const uiRequired = input.uiRequired !== false;
  const authMode = input.authMode || inferAuthMode(input.prompt || '');
  const targetKind = input.targetKind || inferQaTargetKind({ prompt: input.prompt ?? null, targetUrl: input.targetUrl ?? null, authMode });
  const requested = input.requestedSurface && input.requestedSurface !== 'auto' ? input.requestedSurface : null;
  const policySurface = surfaceForKind(targetKind, uiRequired, authMode);
  const selected = requested || policySurface;
  const reason = requested
    ? `operator_requested_${requested}_after_policy_kind_${targetKind}`
    : reasonForSelection(policySurface, targetKind, authMode);
  return {
    schema: 'sks.qa-loop-surface-selection.v2',
    selected_at: nowIso(),
    mission_id: input.missionId || null,
    selected_surface: selected,
    target_kind: targetKind,
    auth_mode: authMode,
    ui_required: uiRequired,
    reason,
    docs_url: docsUrlForSurface(selected),
    alternatives: alternativesFor(policySurface, selected, targetKind, authMode),
    structured_data_first: targetKind === 'structured_data',
    visual_surface_required: uiRequired && !['structured_mcp', 'shell_or_api_diagnostic'].includes(selected)
  };
}

export function selectQaSurfaceForContract(contract: QaContractV2): QaSurfaceSelection {
  return selectQaSurface({
    missionId: contract.mission_id,
    prompt: contract.prompt,
    targetUrl: contract.target.url,
    uiRequired: contract.scope.ui_required,
    authMode: contract.auth.mode,
    requestedSurface: contract.cli.requested_surface,
    targetKind: contract.target.kind
  });
}

export function inferAuthMode(prompt: string): QaAuthMode {
  if (/(cookie|profile|existing tab|extension|signed[- ]?in session|browser state|쿠키|프로필|세션)/i.test(prompt)) return 'existing_browser_profile';
  if (/(login|log in|signin|sign in|auth|credential|sso|로그인|인증|계정)/i.test(prompt)) return 'blocked_missing_credentials';
  return 'not_required';
}

function surfaceForKind(kind: QaTargetKind, uiRequired: boolean, authMode: QaAuthMode): QaInteractionSurface {
  if (!uiRequired && kind === 'structured_data') return 'structured_mcp';
  if (!uiRequired) return 'shell_or_api_diagnostic';
  if (kind === 'signed_in_web' || authMode === 'existing_browser_profile' || authMode === 'runtime_ephemeral_credentials') return 'codex_chrome_extension';
  if (kind === 'native_gui' || kind === 'cross_app_gui') return 'codex_computer_use';
  if (kind === 'structured_data') return 'structured_mcp';
  return 'codex_in_app_browser';
}

function reasonForSelection(surface: QaInteractionSurface, kind: QaTargetKind, authMode: QaAuthMode): string {
  if (surface === 'codex_in_app_browser') return `local_or_public_unauthenticated_web_kind_${kind}`;
  if (surface === 'codex_chrome_extension') return `signed_in_browser_state_required_auth_${authMode}`;
  if (surface === 'codex_computer_use') return `native_or_cross_app_gui_kind_${kind}`;
  if (surface === 'structured_mcp') return 'structured_data_operation_first_then_visual_verify_if_needed';
  return 'api_or_shell_diagnostic_no_ui_surface_required';
}

function docsUrlForSurface(surface: QaInteractionSurface): string {
  if (surface === 'codex_in_app_browser') return CODEX_IN_APP_BROWSER_DOC_URL;
  if (surface === 'codex_chrome_extension') return CODEX_CHROME_EXTENSION_DOC_URL;
  if (surface === 'codex_computer_use') return CODEX_COMPUTER_USE_DOC_URL;
  return CODEX_APP_SERVER_DOC_URL;
}

function alternativesFor(policySurface: QaInteractionSurface, selected: QaInteractionSurface, kind: QaTargetKind, authMode: QaAuthMode) {
  const choices: QaInteractionSurface[] = ['codex_in_app_browser', 'codex_chrome_extension', 'codex_computer_use', 'structured_mcp', 'shell_or_api_diagnostic'];
  return choices.map((surface) => {
    if (surface === selected) return { surface, status: 'selected' as const, reason: surface === policySurface ? 'policy_default' : 'operator_override' };
    if (surface === policySurface) return { surface, status: 'fallback_candidate' as const, reason: 'policy_default_not_selected_due_override' };
    if (surface === 'codex_chrome_extension' && authMode === 'not_required' && (kind === 'local_web' || kind === 'public_web')) {
      return { surface, status: 'not_applicable' as const, reason: 'no_signed_in_browser_state_required' };
    }
    if (surface === 'codex_computer_use' && !['native_gui', 'cross_app_gui'].includes(kind)) {
      return { surface, status: 'blocked_by_policy' as const, reason: 'not_native_or_cross_app_gui' };
    }
    return { surface, status: 'not_applicable' as const, reason: `not_required_for_${kind}` };
  });
}
