import path from 'node:path';
import { ensureDir, nowIso, readJson, writeJsonAtomic, exists } from '../fsx.js';
import { missionDir } from '../mission.js';
import { setCurrent } from '../mission.js';
import type { SksStopGateV1, SksStopGateEvidence, StopGateStatus, StopGateTerminalState } from './stop-gate-types.js';

export interface FinalStopGateInput {
  readonly root: string;
  readonly missionId: string;
  readonly route: string;
  readonly routeCommand: string;
  readonly status: StopGateStatus;
  readonly terminal: boolean;
  readonly terminalState: StopGateTerminalState;
  readonly evidence: SksStopGateEvidence;
  readonly blockers?: readonly string[];
  readonly missingFields?: readonly string[];
  readonly nativeGateFile?: string;
  readonly preserveNativeGate?: boolean;
  readonly nativeGatePatch?: Record<string, unknown>;
}

export async function writeFinalStopGate(input: FinalStopGateInput): Promise<SksStopGateV1> {
  const dir = missionDir(input.root, input.missionId);
  await ensureDir(dir);

  const evidenceBlockers = input.status === 'passed' ? evidenceMissingBlockers(input.evidence) : [];
  const status = evidenceBlockers.length ? 'blocked' : input.status;
  const blockers = [...(input.blockers ?? []), ...evidenceBlockers];
  const missingFields = [...(input.missingFields ?? []), ...evidenceBlockers.map((blocker) => `evidence:${blocker}`)];
  const passed = status === 'passed';
  const nativeGateFile = input.nativeGateFile ?? 'naruto-gate.json';
  const nativeGatePath = path.join(dir, nativeGateFile);
  const canonicalGatePath = path.join(dir, 'stop-gate.json');
  const latestGatePath = path.join(dir, 'stop-gate.latest.json');
  const verifyPath = path.join(dir, 'stop-gate-write-verify.json');

  const gate: SksStopGateV1 = {
    schema: 'sks.stop-gate.v1',
    route: input.route,
    route_command: input.routeCommand,
    mission_id: input.missionId,
    gate_file: nativeGateFile,
    gate_abs_path: canonicalGatePath,
    status,
    passed,
    terminal: evidenceBlockers.length ? false : input.terminal,
    terminal_state: evidenceBlockers.length ? 'blocked' : input.terminalState,
    evidence: input.evidence,
    blockers,
    missing_fields: missingFields,
    created_at: nowIso(),
  };

  // 1. Write route-native gate file (backwards compat), preserving detailed native fields by default.
  const preserveNativeGate = input.preserveNativeGate !== false;
  if (preserveNativeGate && await exists(nativeGatePath)) {
    const existing = await readJson(nativeGatePath, {}) as Record<string, unknown>;
    await writeJsonAtomic(nativeGatePath, {
      ...existing,
      ...(input.nativeGatePatch ?? {}),
      route: input.route,
      route_command: input.routeCommand,
      mission_id: input.missionId,
      status,
      passed,
      terminal: gate.terminal,
      terminal_state: gate.terminal_state,
      evidence: {
        ...((existing.evidence as Record<string, unknown>) || {}),
        ...input.evidence
      },
      blockers,
      missing_fields: missingFields,
      updated_at: nowIso()
    });
  } else {
    await writeJsonAtomic(nativeGatePath, {
      schema: nativeGateFile === 'termination.json' ? 'sks.glm-naruto-termination.v1' : 'sks.naruto-gate.v1',
      route: input.route,
      route_command: input.routeCommand,
      mission_id: input.missionId,
      status,
      passed,
      terminal: gate.terminal,
      terminal_state: gate.terminal_state,
      evidence: input.evidence,
      blockers,
      missing_fields: missingFields,
      updated_at: nowIso(),
      ...(input.nativeGatePatch ?? {})
    });
  }
  // 2. Write canonical stop-gate.json
  await writeJsonAtomic(canonicalGatePath, gate);
  // 3. Write stop-gate.latest.json
  await writeJsonAtomic(latestGatePath, gate);

  // 4. Update current state with absolute path
  await setCurrent(input.root, {
    mission_id: input.missionId,
    route: input.route,
    route_command: input.routeCommand,
    mode: input.route === 'GLM_NARUTO' ? 'NARUTO' : (input.route === 'Naruto' ? 'NARUTO' : input.route),
    stop_gate: 'stop-gate.json',
    stop_gate_abs_path: canonicalGatePath,
    stop_gate_status: status,
    stop_gate_passed: passed,
    route_evidence_passed: input.evidence.route_evidence_passed ?? passed,
    terminal: gate.terminal,
    terminal_state: gate.terminal_state,
  });

  // 5. Re-read and verify
  const verifyResult: Record<string, unknown> = {
    schema: 'sks.stop-gate-write-verify.v1',
    verified: false,
    checked_paths: [nativeGatePath, canonicalGatePath, latestGatePath],
    created_at: nowIso(),
  };
  const errors: string[] = [];
  for (const [label, p] of [['native', nativeGatePath], ['canonical', canonicalGatePath], ['latest', latestGatePath]] as const) {
    if (!(await exists(p))) {
      errors.push(`${label}:file_missing:${p}`);
      continue;
    }
    const re = await readJson(p, null) as Record<string, unknown> | null;
    if (!re) {
      errors.push(`${label}:unreadable`);
    } else if (re.passed !== passed) {
      errors.push(`${label}:passed_mismatch:expected=${passed}:got=${re.passed}`);
    }
  }
  verifyResult.errors = errors;
  verifyResult.verified = errors.length === 0;
  await writeJsonAtomic(verifyPath, verifyResult);

  return gate;
}

function evidenceMissingBlockers(evidence: SksStopGateEvidence): string[] {
  const blockers: string[] = [];
  if (evidence.proof_required === true && evidence.proof_passed !== true) blockers.push('proof_not_passed');
  if (evidence.reflection_required === true && evidence.reflection_passed !== true && evidence.reflection_passed !== 'not_required') blockers.push('reflection_not_passed');
  return blockers;
}
