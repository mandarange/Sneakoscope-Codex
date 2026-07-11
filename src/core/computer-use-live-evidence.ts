import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureDir, exists, nowIso, packageRoot, readJson, rel, sha256, writeJsonAtomic } from './fsx.js';
import type { ComputerUseStatus } from './computer-use-status.js';
import { addVisualAnchor, ingestImage, missionImageLedgerPath } from './wiki-image/image-voxel-ledger.js';

export type ComputerUseEvidenceMode =
  | 'probe_only'
  | 'live_capture_attempted'
  | 'live_capture_success'
  | 'live_capture_blocked';

export type ComputerUseCaptureStatus =
  | 'not_attempted'
  | 'captured'
  | 'blocked'
  | 'failed'
  | 'redacted'
  | 'local_only';

export interface ComputerUseLiveEvidence {
  schema: 'sks.computer-use-live-evidence.v1';
  generated_at: string;
  route: string | null;
  mission_id: string | null;
  mode: ComputerUseEvidenceMode;
  status: ComputerUseStatus;
  platform: string;
  mock: false;
  capability: {
    codex_app_installed: boolean;
    capability_detected: boolean;
    external_capability_blocked: boolean;
    blocker: ComputerUseStatus | null;
  };
  capture: {
    screenshot: {
      attempted: boolean;
      status: ComputerUseCaptureStatus;
      path: string | null;
      sha256: string | null;
      redacted: boolean;
      local_only: boolean;
      adapter_provenance: ComputerUseAdapterProvenance;
    };
    action: {
      attempted: boolean;
      status: ComputerUseCaptureStatus;
      actions: unknown[];
      redacted: boolean;
      local_only: boolean;
    };
  };
  image_voxel: {
    linked: boolean;
    ledger_path: string | null;
    anchor_ids: string[];
    reason: string | null;
  };
  privacy: {
    shared_triwiki_publish_allowed: false;
    contains_screen_content: boolean;
    redaction_required: boolean;
  };
  blockers: string[];
  warnings: string[];
}

export interface ComputerUseAdapterProvenance {
  source: 'codex_app_computer_use_host' | 'mock_fixture' | 'untrusted' | 'missing';
  execution_class: 'real' | 'mock_fixture' | 'untrusted' | 'missing';
  factory: 'createOfficialCodexComputerUseScreenshotAdapter' | null;
  verified: boolean;
  attestation_schema: 'sks.codex-computer-use-capture-attestation.v1' | null;
  adapter_id: 'codex-app-computer-use-host' | null;
  attestation_id: string | null;
  issued_at: string | null;
  request_binding: string | null;
}

export interface ComputerUseCaptureAttestation {
  schema: 'sks.codex-computer-use-capture-attestation.v1';
  adapter_id: 'codex-app-computer-use-host';
  issued_by: 'createOfficialCodexComputerUseScreenshotAdapter';
  execution_class: 'real';
  attestation_id: string;
  issued_at: string;
  request_binding: string;
}

export interface ComputerUseScreenshotAdapterProvenance {
  source: 'codex_app_computer_use_host' | 'mock_fixture';
  execution_class: 'real' | 'mock_fixture';
  factory?: 'createOfficialCodexComputerUseScreenshotAdapter' | null;
}

type ComputerUseScreenshotCaptureResult = {
  ok: boolean;
  path?: string | null;
  data?: Buffer | Uint8Array | string | null;
  blocker?: string | null;
  warning?: string | null;
  redacted?: boolean;
  localOnly?: boolean;
  attestation?: ComputerUseCaptureAttestation | null;
};

export interface ComputerUseScreenshotCaptureAdapter {
  readonly provenance?: ComputerUseScreenshotAdapterProvenance;
  captureScreenshot: (opts: {
    root: string;
    route: string | null;
    missionId: string | null;
    outputPath: string;
  }) => Promise<ComputerUseScreenshotCaptureResult>;
}

const officialScreenshotAdapters = new WeakSet<object>();
const officialCaptureAttestations = new WeakMap<object, ComputerUseCaptureAttestation>();

/**
 * Production trust boundary for a Codex App Computer Use host bridge.
 * Object-literal adapters and fixture callbacks cannot mint the in-process
 * attestation required for live_capture_success.
 */
export function createOfficialCodexComputerUseScreenshotAdapter(
  captureScreenshot: ComputerUseScreenshotCaptureAdapter['captureScreenshot']
): ComputerUseScreenshotCaptureAdapter {
  if (typeof captureScreenshot !== 'function') throw new TypeError('official_computer_use_capture_function_required');
  const adapter: ComputerUseScreenshotCaptureAdapter = {
    provenance: Object.freeze({
      source: 'codex_app_computer_use_host',
      execution_class: 'real',
      factory: 'createOfficialCodexComputerUseScreenshotAdapter'
    }),
    async captureScreenshot(opts) {
      const raw = await captureScreenshot(opts);
      if (!raw || typeof raw !== 'object' || raw.ok !== true) return raw;
      const attestation: ComputerUseCaptureAttestation = Object.freeze({
        schema: 'sks.codex-computer-use-capture-attestation.v1',
        adapter_id: 'codex-app-computer-use-host',
        issued_by: 'createOfficialCodexComputerUseScreenshotAdapter',
        execution_class: 'real',
        attestation_id: randomUUID(),
        issued_at: nowIso(),
        request_binding: captureRequestBinding(opts)
      });
      const result: ComputerUseScreenshotCaptureResult = { ...raw, attestation };
      officialCaptureAttestations.set(result, attestation);
      return result;
    }
  };
  officialScreenshotAdapters.add(adapter);
  return adapter;
}

export interface CodexAppComputerUseCapabilityAdapter {
  detect: () => Promise<{
    codex_app_installed: boolean;
    capability_detected: boolean;
    external_capability_blocked?: boolean;
    blocker?: ComputerUseStatus | null;
  }>;
}

export interface BuildComputerUseLiveEvidenceOptions {
  root?: string;
  route?: string | null;
  missionId?: string | null;
  statusReport: Record<string, any>;
  realOptIn?: boolean;
  captureScreenshot?: boolean;
  allowAction?: boolean;
  screenshotAdapter?: ComputerUseScreenshotCaptureAdapter | null;
  capabilityAdapter?: CodexAppComputerUseCapabilityAdapter | null;
  evidencePath?: string | null;
}

export function computerUseLiveEvidencePath(root: string = packageRoot(), opts: { missionId?: string | null } = {}) {
  if (opts.missionId) {
    return path.join(root, '.sneakoscope', 'missions', opts.missionId, 'computer-use-live-evidence.json');
  }
  return path.join(root, '.sneakoscope', 'reports', 'computer-use-live-evidence.json');
}

export async function readComputerUseLiveEvidence(root: string = packageRoot(), opts: { missionId?: string | null; path?: string | null } = {}) {
  const candidates = [
    opts.path || null,
    opts.missionId ? computerUseLiveEvidencePath(root, { missionId: opts.missionId }) : null,
    computerUseLiveEvidencePath(root)
  ].filter(Boolean) as string[];
  for (const file of candidates) {
    const parsed = await readJson(file, null).catch(() => null);
    if (isComputerUseLiveEvidence(parsed)) return { ok: true, path: file, evidence: parsed };
  }
  return { ok: false, path: null, evidence: null };
}

export async function writeComputerUseLiveEvidence(file: string, evidence: ComputerUseLiveEvidence) {
  await ensureDir(path.dirname(file));
  await writeJsonAtomic(file, evidence);
  return { ok: true, path: file, evidence };
}

export async function buildComputerUseLiveEvidence(opts: BuildComputerUseLiveEvidenceOptions): Promise<ComputerUseLiveEvidence> {
  const root = opts.root || packageRoot();
  const status = normalizeComputerUseStatus(opts.statusReport?.status);
  const realOptIn = opts.realOptIn === true;
  const route = opts.route || null;
  const missionId = opts.missionId || null;
  const warnings: string[] = [];
  const blockers: string[] = [];
  const capability = await detectCapability(opts);
  const platform = String(opts.statusReport?.platform || process.platform);
  let mode: ComputerUseEvidenceMode = realOptIn && status !== 'not_macos' ? 'live_capture_attempted' : 'probe_only';

  const evidence: ComputerUseLiveEvidence = {
    schema: 'sks.computer-use-live-evidence.v1',
    generated_at: nowIso(),
    route,
    mission_id: missionId,
    mode,
    status,
    platform,
    mock: false,
    capability,
    capture: {
      screenshot: {
        attempted: false,
        status: 'not_attempted',
        path: null,
        sha256: null,
        redacted: false,
        local_only: true,
        adapter_provenance: missingAdapterProvenance()
      },
      action: {
        attempted: false,
        status: 'not_attempted',
        actions: [],
        redacted: false,
        local_only: true
      }
    },
    image_voxel: {
      linked: false,
      ledger_path: missionId ? rel(root, missionImageLedgerPath(root, missionId)) : null,
      anchor_ids: [],
      reason: null
    },
    privacy: {
      shared_triwiki_publish_allowed: false,
      contains_screen_content: false,
      redaction_required: false
    },
    blockers,
    warnings
  };

  if (!realOptIn) {
    evidence.image_voxel.reason = 'probe_only_no_live_capture_attempted';
    return evidence;
  }

  if (status === 'not_macos') {
    blockers.push('not_macos');
    evidence.mode = 'probe_only';
    evidence.image_voxel.reason = 'not_macos';
    return evidence;
  }

  if (status !== 'available') {
    blockers.push(status);
    evidence.mode = 'live_capture_blocked';
    evidence.capture.screenshot.status = opts.captureScreenshot ? 'blocked' : 'not_attempted';
    evidence.capture.screenshot.attempted = opts.captureScreenshot === true;
    evidence.image_voxel.reason = status;
    return evidence;
  }

  if (opts.captureScreenshot) {
    await attemptScreenshotCapture(root, evidence, opts);
  } else {
    evidence.image_voxel.reason = 'capture_screenshot_not_requested';
  }

  if (opts.allowAction) {
    evidence.capture.action.attempted = true;
    evidence.capture.action.status = 'blocked';
    blockers.push('computer_use_action_adapter_missing');
    warnings.push('Computer Use smoke never runs click/type actions without an official non-destructive Codex App adapter.');
  }

  if (evidence.capture.screenshot.status === 'captured' && evidence.capture.screenshot.adapter_provenance.verified) {
    evidence.mode = 'live_capture_success';
    evidence.privacy.contains_screen_content = true;
  } else if (blockers.length) {
    evidence.mode = 'live_capture_blocked';
  }
  return evidence;
}

export function isComputerUseLiveEvidence(value: unknown): value is ComputerUseLiveEvidence {
  if (!value || typeof value !== 'object') return false;
  const evidence = value as Partial<ComputerUseLiveEvidence>;
  const structurallyValid = evidence.schema === 'sks.computer-use-live-evidence.v1'
    && isComputerUseEvidenceMode(evidence.mode)
    && evidence.mock === false
    && typeof evidence.capture === 'object'
    && typeof evidence.privacy === 'object';
  if (!structurallyValid) return false;
  if (evidence.mode !== 'live_capture_success') return true;
  const screenshot = evidence.capture?.screenshot;
  return screenshot?.status === 'captured'
    && typeof screenshot.path === 'string'
    && screenshot.path.length > 0
    && typeof screenshot.sha256 === 'string'
    && /^[a-f0-9]{64}$/.test(screenshot.sha256)
    && isPersistedOfficialAdapterProvenance(screenshot.adapter_provenance);
}

export function isComputerUseEvidenceMode(value: unknown): value is ComputerUseEvidenceMode {
  return value === 'probe_only'
    || value === 'live_capture_attempted'
    || value === 'live_capture_success'
    || value === 'live_capture_blocked';
}

async function detectCapability(opts: BuildComputerUseLiveEvidenceOptions): Promise<ComputerUseLiveEvidence['capability']> {
  if (opts.capabilityAdapter) {
    const detected = await opts.capabilityAdapter.detect();
    return {
      codex_app_installed: Boolean(detected.codex_app_installed),
      capability_detected: Boolean(detected.capability_detected),
      external_capability_blocked: detected.external_capability_blocked === true,
      blocker: detected.blocker || null
    };
  }
  const status = normalizeComputerUseStatus(opts.statusReport?.status);
  const installed = Boolean(opts.statusReport?.app?.app?.installed);
  const available = status === 'available';
  return {
    codex_app_installed: installed,
    capability_detected: available,
    external_capability_blocked: status !== 'available',
    blocker: available ? null : status
  };
}

async function attemptScreenshotCapture(root: string, evidence: ComputerUseLiveEvidence, opts: BuildComputerUseLiveEvidenceOptions) {
  evidence.capture.screenshot.attempted = true;
  const outputPath = screenshotArtifactPath(root, opts);
  const adapter = opts.screenshotAdapter || null;
  if (!adapter) {
    evidence.capture.screenshot.status = 'blocked';
    evidence.blockers.push('codex_app_capability_missing');
    evidence.warnings.push('Official Codex App Computer Use screenshot adapter is not exposed to this CLI process.');
    evidence.image_voxel.reason = 'computer_use_capture_adapter_missing';
    return;
  }
  const provenance = adapterProvenance(adapter);
  evidence.capture.screenshot.adapter_provenance = provenance;
  if (!officialScreenshotAdapters.has(adapter as object)) {
    evidence.capture.screenshot.status = 'blocked';
    evidence.blockers.push('computer_use_screenshot_adapter_untrusted');
    evidence.warnings.push(provenance.execution_class === 'mock_fixture'
      ? 'Mock/fixture Computer Use screenshot adapters cannot satisfy real live evidence.'
      : 'Caller-supplied Computer Use screenshot adapters require the official production adapter factory.');
    evidence.image_voxel.reason = 'computer_use_screenshot_adapter_untrusted';
    return;
  }
  try {
    const result = await adapter.captureScreenshot({
      root,
      route: opts.route || null,
      missionId: opts.missionId || null,
      outputPath
    });
    if (!result.ok) {
      evidence.capture.screenshot.status = 'blocked';
      evidence.blockers.push(redactCaptureMessage(result.blocker || 'external_capability_blocked'));
      if (result.warning) evidence.warnings.push(redactCaptureMessage(result.warning));
      evidence.image_voxel.reason = result.blocker || 'screenshot_capture_blocked';
      return;
    }
    const attestation = officialCaptureAttestations.get(result as object);
    if (!attestation
      || result.attestation !== attestation
      || attestation.request_binding !== captureRequestBinding({
        root,
        route: opts.route || null,
        missionId: opts.missionId || null,
        outputPath
      })) {
      evidence.capture.screenshot.status = 'blocked';
      evidence.blockers.push('computer_use_capture_attestation_invalid');
      evidence.image_voxel.reason = 'computer_use_capture_attestation_invalid';
      return;
    }
    evidence.capture.screenshot.adapter_provenance = {
      source: 'codex_app_computer_use_host',
      execution_class: 'real',
      factory: 'createOfficialCodexComputerUseScreenshotAdapter',
      verified: true,
      attestation_schema: attestation.schema,
      adapter_id: attestation.adapter_id,
      attestation_id: attestation.attestation_id,
      issued_at: attestation.issued_at,
      request_binding: attestation.request_binding
    };
    const capturedPath = await materializeScreenshot(result, outputPath);
    const data = await fsp.readFile(capturedPath);
    evidence.capture.screenshot.status = result.localOnly === false ? 'captured' : 'captured';
    evidence.capture.screenshot.path = rel(root, capturedPath);
    evidence.capture.screenshot.sha256 = sha256(data);
    evidence.capture.screenshot.redacted = result.redacted === true;
    evidence.capture.screenshot.local_only = result.localOnly !== false;
    evidence.privacy.redaction_required = result.redacted === true;
    await linkScreenshotToImageVoxel(root, evidence, capturedPath, opts);
  } catch (err: unknown) {
    evidence.capture.screenshot.status = 'failed';
    evidence.blockers.push('screenshot_capture_failed');
    evidence.image_voxel.reason = redactCaptureMessage(err instanceof Error ? err.message : String(err));
  }
}

async function materializeScreenshot(result: Awaited<ReturnType<ComputerUseScreenshotCaptureAdapter['captureScreenshot']>>, outputPath: string) {
  if (result.path && await exists(result.path)) return path.resolve(result.path);
  if (result.data === undefined || result.data === null) throw new Error('screenshot_capture_returned_no_path_or_data');
  await ensureDir(path.dirname(outputPath));
  const bytes = typeof result.data === 'string' ? Buffer.from(result.data, 'base64') : Buffer.from(result.data);
  await fsp.writeFile(outputPath, bytes);
  return outputPath;
}

async function linkScreenshotToImageVoxel(root: string, evidence: ComputerUseLiveEvidence, screenshotPath: string, opts: BuildComputerUseLiveEvidenceOptions) {
  if (!opts.missionId) {
    evidence.image_voxel.reason = 'mission_id_missing';
    return;
  }
  if (!evidence.capture.screenshot.sha256) {
    evidence.image_voxel.reason = 'screenshot_sha256_missing';
    return;
  }
  const relative = rel(root, screenshotPath);
  if (relative.startsWith('..')) {
    evidence.image_voxel.reason = 'screenshot_path_outside_project';
    return;
  }
  try {
    const imageId = evidence.capture.screenshot.sha256;
    const ingested = await ingestImage(root, relative, {
      missionId: opts.missionId,
      source: 'computer_use_live_screenshot',
      id: imageId,
      capturedAt: evidence.generated_at
    });
    const image = ingested.image;
    const anchorId = `computer-use-${imageId.slice(0, 16)}-screen`;
    const anchor = await addVisualAnchor(root, {
      id: anchorId,
      missionId: opts.missionId,
      imageId,
      bbox: [0, 0, image.width || 1, image.height || 1],
      label: 'Computer Use live screenshot',
      source: 'computer_use_live_screenshot',
      evidencePath: relative,
      route: opts.route || '$Computer-Use',
      trustScore: 0.86
    });
    evidence.image_voxel.linked = Boolean(anchor.ok);
    evidence.image_voxel.ledger_path = rel(root, missionImageLedgerPath(root, opts.missionId));
    evidence.image_voxel.anchor_ids = anchor.ok ? [anchorId] : [];
    evidence.image_voxel.reason = anchor.ok ? null : (anchor.validation?.issues || ['image_voxel_anchor_failed']).join(',');
  } catch (err: unknown) {
    evidence.image_voxel.reason = redactCaptureMessage(err instanceof Error ? err.message : String(err));
  }
}

function screenshotArtifactPath(root: string, opts: BuildComputerUseLiveEvidenceOptions) {
  if (opts.missionId) {
    return path.join(root, '.sneakoscope', 'missions', opts.missionId, 'computer-use-live-screenshot.png');
  }
  return path.join(root, '.sneakoscope', 'reports', 'computer-use-live-screenshot.png');
}

function normalizeComputerUseStatus(value: unknown): ComputerUseStatus {
  const allowed: ComputerUseStatus[] = [
    'available',
    'codex_app_missing',
    'macos_permission_missing',
    'codex_app_capability_missing',
    'external_capability_blocked',
    'not_macos',
    'unknown'
  ];
  return allowed.includes(value as ComputerUseStatus) ? value as ComputerUseStatus : 'unknown';
}

function redactCaptureMessage(value: unknown) {
  return String(value || 'unknown')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/CODEX_LB_API_KEY=([^\s]+)/g, 'CODEX_LB_API_KEY=[redacted]')
    .slice(0, 500);
}

function captureRequestBinding(opts: { root: string; route: string | null; missionId: string | null; outputPath: string }) {
  return sha256(Buffer.from(JSON.stringify({
    root: path.resolve(opts.root),
    route: opts.route,
    mission_id: opts.missionId,
    output_path: path.resolve(opts.outputPath)
  })));
}

function missingAdapterProvenance(): ComputerUseAdapterProvenance {
  return {
    source: 'missing',
    execution_class: 'missing',
    factory: null,
    verified: false,
    attestation_schema: null,
    adapter_id: null,
    attestation_id: null,
    issued_at: null,
    request_binding: null
  };
}

function adapterProvenance(adapter: ComputerUseScreenshotCaptureAdapter): ComputerUseAdapterProvenance {
  if (officialScreenshotAdapters.has(adapter as object)) {
    return {
      source: 'codex_app_computer_use_host',
      execution_class: 'real',
      factory: 'createOfficialCodexComputerUseScreenshotAdapter',
      verified: false,
      attestation_schema: null,
      adapter_id: null,
      attestation_id: null,
      issued_at: null,
      request_binding: null
    };
  }
  if (adapter.provenance?.execution_class === 'mock_fixture') {
    return {
      source: 'mock_fixture',
      execution_class: 'mock_fixture',
      factory: null,
      verified: false,
      attestation_schema: null,
      adapter_id: null,
      attestation_id: null,
      issued_at: null,
      request_binding: null
    };
  }
  return {
    source: 'untrusted',
    execution_class: 'untrusted',
    factory: null,
    verified: false,
    attestation_schema: null,
    adapter_id: null,
    attestation_id: null,
    issued_at: null,
    request_binding: null
  };
}

function isPersistedOfficialAdapterProvenance(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const provenance = value as Partial<ComputerUseAdapterProvenance>;
  return provenance.source === 'codex_app_computer_use_host'
    && provenance.execution_class === 'real'
    && provenance.factory === 'createOfficialCodexComputerUseScreenshotAdapter'
    && provenance.verified === true
    && provenance.attestation_schema === 'sks.codex-computer-use-capture-attestation.v1'
    && provenance.adapter_id === 'codex-app-computer-use-host'
    && typeof provenance.attestation_id === 'string'
    && provenance.attestation_id.length > 0
    && typeof provenance.issued_at === 'string'
    && Number.isFinite(Date.parse(provenance.issued_at))
    && typeof provenance.request_binding === 'string'
    && /^[a-f0-9]{64}$/.test(provenance.request_binding);
}
