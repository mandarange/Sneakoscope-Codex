import fsp from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nowIso, sha256, writeJsonAtomic } from '../fsx.js';
import type { SksSkillSourceResolution } from '../codex-native/sks-skill-paths.js';
import {
  ensureConfinedDirectory,
  inspectConfinedPath,
  removeManagedPathVerified
} from '../managed-path-safety.js';

export const SUBAGENT_SKILL_AVAILABILITY_BLOCKER_FILENAME = 'subagent-skill-availability-blocker.json';
export const SUBAGENT_SKILL_AVAILABILITY_BLOCKER_SCHEMA = 'sks.subagent-skill-availability-blocker.v1';

const GUARD_DIR = 'subagent-skill-availability';
const EMERGENCY_DENIAL_DIR = 'subagent-skill-availability-emergency-denials';
const MAX_EMERGENCY_DENIALS = 64;
const MAX_LIFECYCLE_GUARD_ENTRIES = 64;
const MAX_LIFECYCLE_GUARD_BYTES = 64 * 1024;
const MAX_SUBAGENT_PLAN_BYTES = 256 * 1024;
const ADMISSION_SCHEMA = 'sks.subagent-skill-availability-admission.v1';
const SUBAGENT_ADMISSION_BLOCKER_RE = /^(?:authoritative_sks_skill_resolution_failed|authoritative_sks_skill_candidate_rejected|authoritative_sks_skill_unavailable:sks(?:-[a-z0-9]+)*|subagent_skill_availability_(?:artifact_dir_unsafe|blocker_artifact_write_failed|guard_persistence_failed))$/;

interface SubagentSkillAvailabilityBlocker {
  schema: typeof SUBAGENT_SKILL_AVAILABILITY_BLOCKER_SCHEMA;
  status: 'blocked';
  mission_id: string | null;
  workflow_run_id: string | null;
  thread_id_hash: string;
  session_scope_hash: string;
  turn_id_hash: string;
  blockers: string[];
  recorded_at: string;
}

interface SubagentSkillAvailabilityAdmission {
  schema: typeof ADMISSION_SCHEMA;
  status: 'allowed' | 'blocked';
  mission_id: string | null;
  workflow_run_id: string | null;
  thread_id_hash: string;
  session_scope_hash: string;
  turn_id_hash: string;
  blockers: string[];
  recorded_at: string;
}

interface GuardRoot {
  root: string;
  boundary: string;
}

export interface SubagentSkillAvailabilityActiveBinding {
  missionId: unknown;
  workflowRunId: unknown;
}

interface MatchingArtifactEvidence {
  blockers: string[];
  missionId: string | null;
  workflowRunId: string | null;
}

type BoundedJsonResult =
  | { status: 'missing' }
  | { status: 'invalid'; childEvidence: boolean }
  | { status: 'value'; value: any };

class SubagentSkillAvailabilityGuardError extends Error {
  constructor(readonly childEvidence: boolean) {
    super('subagent_skill_availability_guard_invalid');
  }
}

export function authoritativeSksSkillResolutionBlockers(
  resolution: SksSkillSourceResolution | null
): string[] {
  if (!resolution) return ['authoritative_sks_skill_resolution_failed'];
  const blockers = [
    ...resolution.unresolved.map((name) => `authoritative_sks_skill_unavailable:${name}`),
    ...(resolution.blockers.length ? ['authoritative_sks_skill_candidate_rejected'] : [])
  ];
  return [...new Set(blockers)];
}

export function renderSubagentSkillAvailabilityHandoff(blockers: readonly string[]): string {
  const codes = blockers.length ? blockers.join(', ') : 'authoritative_sks_skill_resolution_failed';
  return [
    'MANDATORY SKS PARENT-BLOCK HANDOFF:',
    '- Current managed SKS skill availability was not verified for this child thread.',
    '- Do not inspect files, call tools, run commands, modify anything, or spawn another agent.',
    '- Immediately return a concise blocked result to the root parent.',
    `- Return status=blocked with blockers=[${codes}].`,
    '- Do not reuse or mention any prior skill location.'
  ].join('\n');
}

export async function persistSubagentSkillAvailabilityBlocker(input: {
  root: string;
  artifactDir: string;
  sessionArtifactDir?: string | null;
  state: any;
  payload: any;
  blockers: readonly string[];
}): Promise<SubagentSkillAvailabilityAdmission> {
  const threadId = String(input.payload?.agent_id || '').trim();
  const sessionScope = String(input.payload?.session_id || '').trim();
  const turnId = String(input.payload?.turn_id || '').trim();
  if (!threadId || !sessionScope || !turnId) {
    throw new Error('subagent_skill_availability_guard_identity_missing');
  }
  const plan: any = await readConfinedJson(input.root, path.join(input.artifactDir, 'subagent-plan.json'));
  const blockers = [...new Set(input.blockers.map((item) => String(item || '').trim()).filter(Boolean))];
  const admission: SubagentSkillAvailabilityAdmission = {
    schema: ADMISSION_SCHEMA,
    status: blockers.length ? 'blocked' : 'allowed',
    mission_id: String(input.state?.mission_id || plan?.mission_id || '').trim() || null,
    workflow_run_id: String(input.state?.official_subagent_run_id || plan?.workflow_run_id || '').trim() || null,
    thread_id_hash: sha256(threadId),
    session_scope_hash: sha256(sessionScope),
    turn_id_hash: sha256(turnId),
    blockers,
    recorded_at: nowIso()
  };
  const roots = await admissionGuardRoots(input.root, input.artifactDir);
  // A healthy restart must not publish an allowed admission until all stale
  // denial evidence for this exact child has been cleared. Persist a bounded
  // fail-closed admission first so cleanup failure cannot leave an earlier
  // allowed guard usable by an exact-schema PreToolUse payload.
  const guardedAdmission: SubagentSkillAvailabilityAdmission = blockers.length
    ? admission
    : {
        ...admission,
        status: 'blocked',
        blockers: ['subagent_skill_availability_blocker_artifact_write_failed']
      };
  const rootWrites = await Promise.all(
    roots.map((guardRoot) => writeAdmissionPair(guardRoot, guardedAdmission))
  );
  const guardPersistenceFailed = !rootWrites.some(Boolean);
  const evidenceBlockers = guardPersistenceFailed
    ? [...new Set([...blockers, 'subagent_skill_availability_guard_persistence_failed'])]
    : blockers;
  let evidenceWrite = true;
  if (evidenceBlockers.length) {
    const blocker: SubagentSkillAvailabilityBlocker = {
      schema: SUBAGENT_SKILL_AVAILABILITY_BLOCKER_SCHEMA,
      status: 'blocked',
      mission_id: admission.mission_id,
      workflow_run_id: admission.workflow_run_id,
      thread_id_hash: admission.thread_id_hash,
      session_scope_hash: admission.session_scope_hash,
      turn_id_hash: admission.turn_id_hash,
      blockers: evidenceBlockers,
      recorded_at: admission.recorded_at
    };
    const emergencyArtifactDirs = guardPersistenceFailed
      ? uniqueArtifactDirs(input.artifactDir, input.sessionArtifactDir)
      : [];
    const [sharedWrite, emergencyWrites] = await Promise.all([
      safeWriteJson(
        path.join(input.artifactDir, SUBAGENT_SKILL_AVAILABILITY_BLOCKER_FILENAME),
        path.resolve(input.root),
        blocker
      ),
      Promise.all(emergencyArtifactDirs.map((artifactDir) => (
        persistEmergencyDenial(path.resolve(input.root), artifactDir, blocker)
      )))
    ]);
    evidenceWrite = sharedWrite && emergencyWrites.every(Boolean);
  } else {
    evidenceWrite = await clearMatchingBlockerArtifact(
      path.resolve(input.root),
      path.resolve(input.artifactDir),
      admission.thread_id_hash,
      input.sessionArtifactDir
    );
  }
  if (guardPersistenceFailed) throw new Error('subagent_skill_availability_guard_persistence_failed');
  if (!evidenceWrite) throw new Error('subagent_skill_availability_blocker_artifact_write_failed');
  if (!blockers.length) {
    const allowedWrites = await Promise.all(
      roots.map((guardRoot) => writeAdmissionPair(guardRoot, admission))
    );
    const guardedRootCommitFailed = rootWrites.some((guardedWrite, index) => (
      guardedWrite && !allowedWrites[index]
    ));
    if (!allowedWrites.some(Boolean) || guardedRootCommitFailed) {
      throw new Error('subagent_skill_availability_guard_persistence_failed');
    }
  }
  return admission;
}

export async function subagentSkillAvailabilityPreToolBlockReason(
  root: string,
  payload: any,
  artifactDir: string | null | undefined,
  activeBinding: SubagentSkillAvailabilityActiveBinding
): Promise<string | null> {
  const rawPayloadThreadId = payload?.agent_id;
  const payloadThreadId = boundedAgentThreadId(rawPayloadThreadId);
  const payloadThreadIdClaimed = typeof rawPayloadThreadId === 'string'
    ? Boolean(rawPayloadThreadId.trim())
    : rawPayloadThreadId !== undefined && rawPayloadThreadId !== null;
  if (payloadThreadIdClaimed && !payloadThreadId) throw invalidGuard(true);
  const rawTranscriptThreadId = await officialSubagentThreadIdFromTranscript(payload?.transcript_path);
  const transcriptThreadId = boundedAgentThreadId(rawTranscriptThreadId);
  if (rawTranscriptThreadId && !transcriptThreadId) throw invalidGuard(true);
  if (payloadThreadId && transcriptThreadId && payloadThreadId !== transcriptThreadId) {
    throw invalidGuard(true);
  }
  const threadId = payloadThreadId || transcriptThreadId;
  const threadHash = threadId ? sha256(threadId) : null;
  const activeMissionId = String(activeBinding?.missionId || '').trim() || null;
  const activeWorkflowRunId = String(activeBinding?.workflowRunId || '').trim() || null;
  if (threadId && (!activeMissionId || !activeWorkflowRunId)) {
    return preToolBlockReason(['subagent_skill_availability_guard_invalid']);
  }
  const sessionScope = String(payload?.session_id || '').trim();
  const turnId = String(payload?.turn_id || '').trim();
  if (!sessionScope || !turnId) {
    return threadId ? preToolBlockReason(['subagent_skill_availability_admission_missing']) : null;
  }
  const sessionHash = sha256(sessionScope);
  const turnHash = sha256(turnId);
  const artifactEvidence = artifactDir
    ? await matchingArtifactBlockers(root, artifactDir, sessionHash, turnHash)
    : null;
  const admissions: SubagentSkillAvailabilityAdmission[] = [];
  const errors: unknown[] = [];
  for (const guardRoot of await admissionGuardRoots(root, artifactDir)) {
    try {
      const admission = await readAdmissionPair(guardRoot, threadHash, sessionHash, turnHash);
      if (admission) admissions.push(admission);
    } catch (error: unknown) {
      errors.push(error);
    }
  }
  const invalidChildEvidence = errors.some((error) => (
    error instanceof SubagentSkillAvailabilityGuardError && error.childEvidence
  ));
  if (artifactEvidence) {
    if (!activeMissionId
      || !activeWorkflowRunId
      || artifactEvidence.missionId !== activeMissionId
      || artifactEvidence.workflowRunId !== activeWorkflowRunId) {
      return preToolBlockReason(['subagent_skill_availability_guard_invalid']);
    }
    return preToolBlockReason(artifactEvidence.blockers);
  }
  if (errors.length && (threadId || admissions.length || invalidChildEvidence)) throw errors[0];
  if (errors.length) return null;
  if (!admissions.length) {
    return threadId ? preToolBlockReason(['subagent_skill_availability_admission_missing']) : null;
  }
  if (!activeMissionId
    || !activeWorkflowRunId
    || admissions.some((admission) => (
      admission.mission_id !== activeMissionId
      || admission.workflow_run_id !== activeWorkflowRunId
    ))) {
    return preToolBlockReason(['subagent_skill_availability_guard_invalid']);
  }
  const fingerprints = new Set(admissions.map(admissionFingerprint));
  if (fingerprints.size !== 1) return preToolBlockReason(['subagent_skill_availability_guard_invalid']);
  const admission = admissions[0]!;
  return admission.status === 'blocked' ? preToolBlockReason(admission.blockers) : null;
}

export async function clearSubagentSkillAvailabilityGuards(
  root: string,
  payload: any,
  artifactDir?: string | null
): Promise<void> {
  const threadId = String(payload?.agent_id || '').trim();
  const sessionScope = String(payload?.session_id || '').trim();
  const turnId = String(payload?.turn_id || '').trim();
  const roots = await admissionGuardRoots(root, artifactDir);
  const files: Array<{ file: string; boundary: string }> = [];
  if (threadId) files.push(...roots.map((guardRoot) => ({
    file: threadGuardPath(guardRoot.root, sha256(threadId)),
    boundary: guardRoot.boundary
  })));
  if (sessionScope && turnId) {
    const sessionHash = sha256(sessionScope);
    const turnHash = sha256(turnId);
    files.push(...roots.map((guardRoot) => ({
      file: turnGuardPath(guardRoot.root, sessionHash, turnHash),
      boundary: guardRoot.boundary
    })));
  }
  await Promise.all(files.map(({ file, boundary }) => safeRemoveGuard(file, boundary)));
}

export async function subagentSkillAvailabilityRunBlockers(
  root: string,
  artifactDir: string,
  missionId: string,
  workflowRunId: string
): Promise<string[]> {
  const blockers: string[] = [];
  for (const guardRoot of await admissionGuardRoots(root, artifactDir)) {
    blockers.push(...await blockedRunAdmissions(guardRoot, missionId, workflowRunId));
  }
  blockers.push(...await emergencyRunBlockers(root, artifactDir, missionId, workflowRunId));
  const file = path.join(artifactDir, SUBAGENT_SKILL_AVAILABILITY_BLOCKER_FILENAME);
  const blockerRead = await readBoundedConfinedJson(
    path.resolve(root),
    file,
    MAX_LIFECYCLE_GUARD_BYTES
  );
  if (blockerRead.status === 'missing') return [...new Set(blockers)];
  if (blockerRead.status !== 'value' || !validBlocker(blockerRead.value)) {
    return [...new Set([...blockers, 'subagent_skill_availability_blocker_artifact_invalid'])];
  }
  const blocker = blockerRead.value;
  if (!missionId || blocker.mission_id !== missionId) {
    return [...new Set([...blockers, 'subagent_skill_availability_blocker_artifact_invalid'])];
  }
  if (!workflowRunId || blocker.workflow_run_id !== workflowRunId) return [...new Set(blockers)];
  return [...new Set([...blockers, ...blocker.blockers])];
}

function rootGuardDir(root: string): string {
  return path.join(root, '.sneakoscope', 'guards', GUARD_DIR);
}

function artifactGuardDir(artifactDir: string): string {
  return path.join(artifactDir, GUARD_DIR);
}

function homeGuardDir(home: string, canonicalRoot: string): string {
  return path.join(home, '.sneakoscope', 'guards', GUARD_DIR, sha256(canonicalRoot));
}

function threadGuardPath(guardRoot: string, threadHash: string): string {
  return path.join(guardRoot, `thread-${threadHash}.json`);
}

function turnGuardPath(guardRoot: string, sessionHash: string, turnHash: string): string {
  return path.join(guardRoot, `turn-${sha256(`${sessionHash}:${turnHash}`)}.json`);
}

function validBlocker(value: any): value is SubagentSkillAvailabilityBlocker {
  return value?.schema === SUBAGENT_SKILL_AVAILABILITY_BLOCKER_SCHEMA
    && value?.status === 'blocked'
    && (value?.mission_id === null || typeof value?.mission_id === 'string')
    && (value?.workflow_run_id === null || typeof value?.workflow_run_id === 'string')
    && /^[a-f0-9]{64}$/.test(String(value?.thread_id_hash || ''))
    && /^[a-f0-9]{64}$/.test(String(value?.session_scope_hash || ''))
    && /^[a-f0-9]{64}$/.test(String(value?.turn_id_hash || ''))
    && Array.isArray(value?.blockers)
    && value.blockers.length > 0
    && value.blockers.every((item: unknown) => SUBAGENT_ADMISSION_BLOCKER_RE.test(String(item || '')));
}

function validAdmission(value: any): value is SubagentSkillAvailabilityAdmission {
  const blockers = Array.isArray(value?.blockers) ? value.blockers : null;
  return value?.schema === ADMISSION_SCHEMA
    && ['allowed', 'blocked'].includes(String(value?.status || ''))
    && (value?.mission_id === null || typeof value?.mission_id === 'string')
    && (value?.workflow_run_id === null || typeof value?.workflow_run_id === 'string')
    && /^[a-f0-9]{64}$/.test(String(value?.thread_id_hash || ''))
    && /^[a-f0-9]{64}$/.test(String(value?.session_scope_hash || ''))
    && /^[a-f0-9]{64}$/.test(String(value?.turn_id_hash || ''))
    && blockers !== null
    && (value.status === 'allowed'
      ? blockers.length === 0
      : blockers.length > 0 && blockers.every((item: unknown) => SUBAGENT_ADMISSION_BLOCKER_RE.test(String(item || ''))));
}

async function readConfinedJson(boundary: string, file: string): Promise<any | null> {
  const result = await readBoundedConfinedJson(
    path.resolve(boundary),
    path.resolve(file),
    MAX_SUBAGENT_PLAN_BYTES
  );
  return result.status === 'value' ? result.value : null;
}

async function admissionGuardRoots(root: string, artifactDir?: string | null): Promise<GuardRoot[]> {
  const projectRoot = path.resolve(root);
  const canonicalRoot = await fsp.realpath(projectRoot);
  const home = path.resolve(process.env.HOME || os.homedir());
  const roots: GuardRoot[] = [
    { root: rootGuardDir(projectRoot), boundary: projectRoot },
    ...(artifactDir ? [{ root: artifactGuardDir(path.resolve(artifactDir)), boundary: projectRoot }] : []),
    { root: homeGuardDir(home, canonicalRoot), boundary: home }
  ];
  const unique = new Map<string, GuardRoot>();
  for (const entry of roots) if (!unique.has(entry.root)) unique.set(entry.root, entry);
  return [...unique.values()];
}

async function writeAdmissionPair(root: GuardRoot, admission: SubagentSkillAvailabilityAdmission): Promise<boolean> {
  const [threadWrite, turnWrite] = await Promise.all([
    safeWriteJson(threadGuardPath(root.root, admission.thread_id_hash), root.boundary, admission),
    safeWriteJson(turnGuardPath(root.root, admission.session_scope_hash, admission.turn_id_hash), root.boundary, admission)
  ]);
  return threadWrite && turnWrite;
}

async function readAdmissionPair(
  root: GuardRoot,
  expectedThreadHash: string | null,
  expectedSessionHash: string,
  expectedTurnHash: string
): Promise<SubagentSkillAvailabilityAdmission | null> {
  const turnFile = turnGuardPath(root.root, expectedSessionHash, expectedTurnHash);
  const turnAdmission = await readAdmission(turnFile, root.boundary);
  if (expectedThreadHash) {
    const threadFile = threadGuardPath(root.root, expectedThreadHash);
    const threadAdmission = await readAdmission(threadFile, root.boundary);
    if (!turnAdmission && !threadAdmission) return null;
    if (!turnAdmission || !threadAdmission) throw invalidGuard(true);
    validateAdmissionBinding(turnAdmission, expectedThreadHash, expectedSessionHash, expectedTurnHash);
    validateAdmissionBinding(threadAdmission, expectedThreadHash, expectedSessionHash, expectedTurnHash);
    if (admissionFingerprint(turnAdmission) !== admissionFingerprint(threadAdmission)) {
      throw invalidGuard(true);
    }
    return turnAdmission;
  }
  if (!turnAdmission) return null;
  validateAdmissionBinding(turnAdmission, turnAdmission.thread_id_hash, expectedSessionHash, expectedTurnHash);
  let threadAdmission: SubagentSkillAvailabilityAdmission | null;
  try {
    threadAdmission = await readAdmission(
      threadGuardPath(root.root, turnAdmission.thread_id_hash),
      root.boundary
    );
  } catch {
    throw invalidGuard(true);
  }
  if (!threadAdmission || admissionFingerprint(turnAdmission) !== admissionFingerprint(threadAdmission)) {
    throw invalidGuard(true);
  }
  return turnAdmission;
}

async function readAdmission(file: string, boundary: string): Promise<SubagentSkillAvailabilityAdmission | null> {
  const result = await readBoundedConfinedJson(boundary, file, MAX_LIFECYCLE_GUARD_BYTES);
  if (result.status === 'missing') return null;
  if (result.status === 'invalid') throw invalidGuard(result.childEvidence);
  if (!validAdmission(result.value)) throw invalidGuard(true);
  return result.value;
}

async function blockedRunAdmissions(
  guardRoot: GuardRoot,
  missionId: string,
  workflowRunId: string
): Promise<string[]> {
  let inspected;
  try {
    inspected = await inspectConfinedPath(guardRoot.boundary, guardRoot.root);
  } catch {
    return ['subagent_skill_availability_guard_invalid'];
  }
  if (!inspected.exists) return [];
  if (inspected.leafSymlink || !inspected.stat?.isDirectory()) {
    return ['subagent_skill_availability_guard_invalid'];
  }
  const names = await boundedDirectoryNames(guardRoot.root);
  if (names === null) return ['subagent_skill_availability_guard_invalid'];
  const blockers: string[] = [];
  for (const name of names.filter((item) => /^thread-[a-f0-9]{64}\.json$/.test(item)).sort()) {
    let admission: SubagentSkillAvailabilityAdmission | null;
    try {
      admission = await readAdmission(path.join(guardRoot.root, name), guardRoot.boundary);
    } catch {
      blockers.push('subagent_skill_availability_guard_invalid');
      continue;
    }
    if (!admission
      || admission.mission_id !== missionId
      || admission.workflow_run_id !== workflowRunId
      || admission.status !== 'blocked') continue;
    blockers.push(...admission.blockers);
  }
  return blockers;
}

function validateAdmissionBinding(
  admission: SubagentSkillAvailabilityAdmission,
  expectedThreadHash: string,
  expectedSessionHash: string,
  expectedTurnHash: string
) {
  if (admission.thread_id_hash !== expectedThreadHash
    || admission.session_scope_hash !== expectedSessionHash
    || admission.turn_id_hash !== expectedTurnHash) {
    throw invalidGuard(true);
  }
}

function invalidGuard(childEvidence: boolean): SubagentSkillAvailabilityGuardError {
  return new SubagentSkillAvailabilityGuardError(childEvidence);
}

function admissionFingerprint(admission: SubagentSkillAvailabilityAdmission): string {
  return sha256(JSON.stringify([
    admission.schema,
    admission.status,
    admission.mission_id,
    admission.workflow_run_id,
    admission.thread_id_hash,
    admission.session_scope_hash,
    admission.turn_id_hash,
    admission.blockers,
    admission.recorded_at
  ]));
}

async function safeWriteJson(file: string, boundary: string, value: unknown): Promise<boolean> {
  try {
    if (Buffer.byteLength(`${JSON.stringify(value, null, 2)}\n`, 'utf8') > MAX_LIFECYCLE_GUARD_BYTES) {
      return false;
    }
    await ensureConfinedDirectory(boundary, path.dirname(file));
    const before = await inspectConfinedPath(boundary, file);
    if (before.exists && (before.leafSymlink || !before.stat?.isFile())) return false;
    await writeJsonAtomic(file, value);
    const after = await inspectConfinedPath(boundary, file);
    return after.exists && !after.leafSymlink && Boolean(after.stat?.isFile());
  } catch {
    return false;
  }
}

async function safeRemoveGuard(file: string, boundary: string): Promise<void> {
  try {
    const inspected = await inspectConfinedPath(boundary, file);
    if (!inspected.exists) return;
    if (inspected.leafSymlink || !inspected.stat?.isFile()) return;
    await removeManagedPathVerified(boundary, file);
  } catch {
    return;
  }
}

async function clearMatchingBlockerArtifact(
  root: string,
  artifactDir: string,
  threadHash: string,
  sessionArtifactDir?: string | null
): Promise<boolean> {
  const file = path.join(artifactDir, SUBAGENT_SKILL_AVAILABILITY_BLOCKER_FILENAME);
  try {
    const emergencyCleared = (await Promise.all(
      uniqueArtifactDirs(artifactDir, sessionArtifactDir).map((candidate) => (
        clearMatchingEmergencyDenials(root, candidate, threadHash)
      ))
    )).every(Boolean);
    const inspected = await inspectConfinedPath(root, file);
    if (!inspected.exists) return emergencyCleared;
    if (inspected.leafSymlink || !inspected.stat?.isFile()) return false;
    const blockerRead = await readBoundedConfinedJson(root, file, MAX_LIFECYCLE_GUARD_BYTES);
    if (blockerRead.status !== 'value' || !validBlocker(blockerRead.value)) return false;
    const blocker = blockerRead.value;
    if (blocker.thread_id_hash !== threadHash) return emergencyCleared;
    await removeManagedPathVerified(root, file);
    return emergencyCleared && !(await inspectConfinedPath(root, file)).exists;
  } catch {
    return false;
  }
}

function uniqueArtifactDirs(...values: Array<string | null | undefined>): string[] {
  return [...new Set(values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .map((value) => path.resolve(value)))];
}

async function matchingArtifactBlockers(
  root: string,
  artifactDir: string,
  sessionHash: string,
  turnHash: string
): Promise<MatchingArtifactEvidence | null> {
  const emergency = await matchingEmergencyDenial(root, artifactDir, sessionHash, turnHash);
  if (emergency) return emergency;
  const file = path.join(path.resolve(artifactDir), SUBAGENT_SKILL_AVAILABILITY_BLOCKER_FILENAME);
  const result = await readBoundedConfinedJson(
    path.resolve(root),
    file,
    MAX_LIFECYCLE_GUARD_BYTES
  );
  if (result.status === 'missing') return null;
  if (result.status !== 'value' || !validBlocker(result.value)) {
    return {
      blockers: ['subagent_skill_availability_guard_invalid'],
      missionId: null,
      workflowRunId: null
    };
  }
  const blocker = result.value;
  return blocker.session_scope_hash === sessionHash && blocker.turn_id_hash === turnHash
    ? {
        blockers: blocker.blockers,
        missionId: blocker.mission_id,
        workflowRunId: blocker.workflow_run_id
      }
    : null;
}

function emergencyDenialDir(artifactDir: string): string {
  return path.join(artifactDir, EMERGENCY_DENIAL_DIR);
}

function emergencyDenialPath(artifactDir: string, sessionHash: string, turnHash: string): string {
  return path.join(
    emergencyDenialDir(artifactDir),
    `deny-${sha256(`${sessionHash}:${turnHash}`)}.json`
  );
}

async function persistEmergencyDenial(
  root: string,
  artifactDir: string,
  blocker: SubagentSkillAvailabilityBlocker
): Promise<boolean> {
  const written = await safeWriteJson(
    emergencyDenialPath(artifactDir, blocker.session_scope_hash, blocker.turn_id_hash),
    root,
    blocker
  );
  if (!written) return false;
  return pruneEmergencyDenials(root, artifactDir);
}

async function matchingEmergencyDenial(
  root: string,
  artifactDir: string,
  sessionHash: string,
  turnHash: string
): Promise<MatchingArtifactEvidence | null> {
  const file = emergencyDenialPath(path.resolve(artifactDir), sessionHash, turnHash);
  try {
    const result = await readBoundedConfinedJson(
      path.resolve(root),
      file,
      MAX_LIFECYCLE_GUARD_BYTES
    );
    if (result.status === 'missing') return null;
    if (result.status !== 'value' || !validBlocker(result.value)
      || result.value.session_scope_hash !== sessionHash
      || result.value.turn_id_hash !== turnHash) {
      return {
        blockers: ['subagent_skill_availability_guard_invalid'],
        missionId: null,
        workflowRunId: null
      };
    }
    return {
      blockers: result.value.blockers,
      missionId: result.value.mission_id,
      workflowRunId: result.value.workflow_run_id
    };
  } catch {
    return null;
  }
}

async function emergencyRunBlockers(
  root: string,
  artifactDir: string,
  missionId: string,
  workflowRunId: string
): Promise<string[]> {
  const records = await readEmergencyDenials(root, artifactDir);
  const blockers: string[] = [];
  for (const record of records) {
    if (!record) {
      blockers.push('subagent_skill_availability_guard_invalid');
      continue;
    }
    if (record.mission_id === missionId && record.workflow_run_id === workflowRunId) {
      blockers.push(...record.blockers);
    }
  }
  return blockers;
}

async function clearMatchingEmergencyDenials(
  root: string,
  artifactDir: string,
  threadHash: string
): Promise<boolean> {
  const records = await readEmergencyDenialsWithFiles(root, artifactDir);
  if (records === null) return false;
  let ok = records.every((entry) => Boolean(entry.blocker));
  for (const { file, blocker } of records) {
    if (!blocker || blocker.thread_id_hash !== threadHash) continue;
    try {
      const entry = await inspectConfinedPath(root, file);
      if (entry.leafSymlink || !entry.stat?.isFile() || entry.stat.size > MAX_LIFECYCLE_GUARD_BYTES) {
        ok = false;
        continue;
      }
      await removeManagedPathVerified(root, file);
      if ((await inspectConfinedPath(root, file)).exists) ok = false;
    } catch {
      ok = false;
    }
  }
  return ok;
}

async function pruneEmergencyDenials(root: string, artifactDir: string): Promise<boolean> {
  const dir = emergencyDenialDir(artifactDir);
  const records = await readEmergencyDenialsWithFiles(root, artifactDir);
  if (records === null) return false;
  const ordered = records
    .filter((entry): entry is { file: string; blocker: SubagentSkillAvailabilityBlocker } => Boolean(entry.blocker))
    .sort((left, right) => right.blocker.recorded_at.localeCompare(left.blocker.recorded_at));
  let ok = records.every((entry) => Boolean(entry.blocker));
  for (const entry of ordered.slice(MAX_EMERGENCY_DENIALS)) {
    try {
      await removeManagedPathVerified(root, entry.file);
      if ((await inspectConfinedPath(root, entry.file)).exists) ok = false;
    } catch {
      ok = false;
    }
  }
  const inspected = await inspectConfinedPath(root, dir).catch(() => null);
  return ok && Boolean(inspected?.exists && inspected.stat?.isDirectory() && !inspected.leafSymlink);
}

async function readEmergencyDenials(
  root: string,
  artifactDir: string
): Promise<Array<SubagentSkillAvailabilityBlocker | null>> {
  const records = await readEmergencyDenialsWithFiles(root, artifactDir);
  return records === null ? [null] : records.map((entry) => entry.blocker);
}

async function readEmergencyDenialsWithFiles(
  root: string,
  artifactDir: string
): Promise<Array<{ file: string; blocker: SubagentSkillAvailabilityBlocker | null }> | null> {
  const dir = emergencyDenialDir(artifactDir);
  let inspected;
  try {
    inspected = await inspectConfinedPath(root, dir);
  } catch {
    return null;
  }
  if (!inspected.exists) return [];
  if (inspected.leafSymlink || !inspected.stat?.isDirectory()) return null;
  const names = await boundedDirectoryNames(dir);
  if (names === null) return null;
  const records: Array<{ file: string; blocker: SubagentSkillAvailabilityBlocker | null }> = [];
  for (const name of names.filter((item) => /^deny-[a-f0-9]{64}\.json$/.test(item)).sort()) {
    const file = path.join(dir, name);
    const result = await readBoundedConfinedJson(root, file, MAX_LIFECYCLE_GUARD_BYTES);
    records.push({
      file,
      blocker: result.status === 'value' && validBlocker(result.value) ? result.value : null
    });
  }
  return records;
}

async function boundedDirectoryNames(directory: string): Promise<string[] | null> {
  let handle;
  try {
    handle = await fsp.opendir(directory);
    const names: string[] = [];
    for await (const entry of handle) {
      names.push(entry.name);
      if (names.length > MAX_LIFECYCLE_GUARD_ENTRIES) return null;
    }
    return names.sort((left, right) => left.localeCompare(right));
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function readBoundedConfinedJson(
  boundary: string,
  file: string,
  maxBytes: number
): Promise<BoundedJsonResult> {
  const absoluteBoundary = path.resolve(boundary);
  const absoluteFile = path.resolve(file);
  let childEvidence = false;
  try {
    const inspected = await inspectConfinedPath(absoluteBoundary, absoluteFile);
    if (!inspected.exists) return { status: 'missing' };
    childEvidence = true;
    if (inspected.leafSymlink || !inspected.stat?.isFile() || inspected.stat.size > maxBytes) {
      return { status: 'invalid', childEvidence };
    }
    const handle = await fsp.open(absoluteFile, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > maxBytes) return { status: 'invalid', childEvidence };
      const buffer = Buffer.alloc(maxBytes + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead > maxBytes || bytesRead !== stat.size) return { status: 'invalid', childEvidence };
      return { status: 'value', value: JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')) };
    } finally {
      await handle.close().catch(() => undefined);
    }
  } catch {
    return { status: 'invalid', childEvidence };
  }
}

function preToolBlockReason(blockers: readonly string[]): string {
  return `SKS blocked this child tool call because managed skill availability failed (${blockers.join(', ')}). Return the blocker to the root parent without using tools.`;
}

function boundedAgentThreadId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!candidate
    || Buffer.byteLength(candidate, 'utf8') > 512
    || /[\u0000-\u001f\u007f]/.test(candidate)) return null;
  return candidate;
}

async function officialSubagentThreadIdFromTranscript(value: unknown): Promise<string | null> {
  const file = String(value || '').trim();
  if (!file) return null;
  const sessionsRoot = path.resolve(
    process.env.CODEX_HOME
      ? path.join(process.env.CODEX_HOME, 'sessions')
      : path.join(process.env.HOME || os.homedir(), '.codex', 'sessions')
  );
  const [sessionsReal, fileReal] = await Promise.all([
    fsp.realpath(sessionsRoot).catch(() => null),
    fsp.realpath(file).catch(() => null)
  ]);
  if (!sessionsReal || !fileReal || !pathIsInside(sessionsReal, fileReal)) return null;
  const stat = await fsp.lstat(file).catch(() => null);
  if (!stat || stat.isSymbolicLink() || !stat.isFile()) return null;
  const handle = await fsp.open(file, 'r').catch(() => null);
  if (!handle) return null;
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    const read = await handle.read(buffer, 0, buffer.length, 0);
    if (read.bytesRead < 1) return null;
    const text = buffer.subarray(0, read.bytesRead).toString('utf8');
    const line = text.split(/\r?\n/, 1)[0]?.trim();
    if (!line) return null;
    const row = JSON.parse(line);
    const source = row?.payload?.source?.subagent;
    const threadSpawn = source?.thread_spawn;
    if (row?.type !== 'session_meta' || !source || typeof source !== 'object'
      || !threadSpawn || typeof threadSpawn !== 'object') return null;
    return String(row?.payload?.id || row?.payload?.session_id || '').trim() || null;
  } catch {
    return null;
  } finally {
    await handle.close().catch(() => undefined);
  }
}

function pathIsInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return Boolean(relative)
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}
