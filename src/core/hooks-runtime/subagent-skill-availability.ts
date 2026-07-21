import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { nowIso, readJson, sha256, writeJsonAtomic } from '../fsx.js';
import type { SksSkillSourceResolution } from '../codex-native/sks-skill-paths.js';
import { ensureConfinedDirectory, inspectConfinedPath } from '../managed-path-safety.js';

export const SUBAGENT_SKILL_AVAILABILITY_BLOCKER_FILENAME = 'subagent-skill-availability-blocker.json';
export const SUBAGENT_SKILL_AVAILABILITY_BLOCKER_SCHEMA = 'sks.subagent-skill-availability-blocker.v1';

const GUARD_DIR = 'subagent-skill-availability';
const EMERGENCY_DENIAL_DIR = 'subagent-skill-availability-emergency-denials';
const MAX_EMERGENCY_DENIALS = 64;
const ADMISSION_SCHEMA = 'sks.subagent-skill-availability-admission.v1';
const SUBAGENT_ADMISSION_BLOCKER_RE = /^(?:authoritative_sks_skill_resolution_failed|authoritative_sks_skill_candidate_rejected|authoritative_sks_skill_unavailable:sks(?:-[a-z0-9]+)*|subagent_skill_availability_(?:artifact_dir_unsafe|guard_persistence_failed))$/;

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
  const rootWrites = await Promise.all(roots.map((guardRoot) => writeAdmissionPair(guardRoot, admission)));
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
    const [sharedWrite, emergencyWrite] = await Promise.all([
      safeWriteJson(
        path.join(input.artifactDir, SUBAGENT_SKILL_AVAILABILITY_BLOCKER_FILENAME),
        path.resolve(input.root),
        blocker
      ),
      guardPersistenceFailed
        ? persistEmergencyDenial(path.resolve(input.root), path.resolve(input.artifactDir), blocker)
        : true
    ]);
    evidenceWrite = sharedWrite && emergencyWrite;
  } else {
    evidenceWrite = await clearMatchingBlockerArtifact(
      path.resolve(input.root),
      path.resolve(input.artifactDir),
      admission.thread_id_hash
    );
  }
  if (guardPersistenceFailed) throw new Error('subagent_skill_availability_guard_persistence_failed');
  if (!evidenceWrite) throw new Error('subagent_skill_availability_blocker_artifact_write_failed');
  return admission;
}

export async function subagentSkillAvailabilityPreToolBlockReason(
  root: string,
  payload: any,
  artifactDir?: string | null
): Promise<string | null> {
  const transcriptThreadId = await officialSubagentThreadIdFromTranscript(payload?.transcript_path);
  const threadId = transcriptThreadId;
  const threadHash = threadId ? sha256(threadId) : null;
  const sessionScope = String(payload?.session_id || '').trim();
  const turnId = String(payload?.turn_id || '').trim();
  if (!sessionScope || !turnId) {
    return threadId ? preToolBlockReason(['subagent_skill_availability_admission_missing']) : null;
  }
  const sessionHash = sha256(sessionScope);
  const turnHash = sha256(turnId);
  const artifactBlockers = artifactDir
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
  if (artifactBlockers) return preToolBlockReason(artifactBlockers);
  if (errors.length && (threadId || admissions.length || invalidChildEvidence)) throw errors[0];
  if (errors.length) return null;
  if (!admissions.length) {
    return threadId ? preToolBlockReason(['subagent_skill_availability_admission_missing']) : null;
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
  const stat = await fsp.lstat(file).catch(() => null);
  if (!stat) return [...new Set(blockers)];
  if (stat.isSymbolicLink() || !stat.isFile()) {
    return [...new Set([...blockers, 'subagent_skill_availability_blocker_artifact_invalid'])];
  }
  const blocker: any = await readJson(file, null).catch(() => null);
  if (!validBlocker(blocker)) {
    return [...new Set([...blockers, 'subagent_skill_availability_blocker_artifact_invalid'])];
  }
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
  try {
    const inspected = await inspectConfinedPath(path.resolve(boundary), path.resolve(file));
    if (!inspected.exists || inspected.leafSymlink || !inspected.stat?.isFile()) return null;
    return await readJson(file, null).catch(() => null);
  } catch {
    return null;
  }
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
  let inspected;
  try {
    inspected = await inspectConfinedPath(boundary, file);
  } catch {
    throw invalidGuard(false);
  }
  if (!inspected.exists) return null;
  if (inspected.leafSymlink || !inspected.stat?.isFile()) {
    throw invalidGuard(true);
  }
  const admission: any = await readJson(file, null).catch(() => null);
  if (!validAdmission(admission)) throw invalidGuard(true);
  return admission;
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
  let names: string[];
  try {
    names = await fsp.readdir(guardRoot.root);
  } catch {
    return ['subagent_skill_availability_guard_invalid'];
  }
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
    await fsp.rm(file, { force: true });
  } catch {
    return;
  }
}

async function clearMatchingBlockerArtifact(
  root: string,
  artifactDir: string,
  threadHash: string
): Promise<boolean> {
  const file = path.join(artifactDir, SUBAGENT_SKILL_AVAILABILITY_BLOCKER_FILENAME);
  try {
    const emergencyCleared = await clearMatchingEmergencyDenials(root, artifactDir, threadHash);
    const inspected = await inspectConfinedPath(root, file);
    if (!inspected.exists) return emergencyCleared;
    if (inspected.leafSymlink || !inspected.stat?.isFile()) return false;
    const blocker: any = await readJson(file, null).catch(() => null);
    if (!validBlocker(blocker) || blocker.thread_id_hash !== threadHash) return emergencyCleared;
    await fsp.rm(file, { force: true });
    return emergencyCleared && !(await inspectConfinedPath(root, file)).exists;
  } catch {
    return false;
  }
}

async function matchingArtifactBlockers(
  root: string,
  artifactDir: string,
  sessionHash: string,
  turnHash: string
): Promise<string[] | null> {
  const emergency = await matchingEmergencyDenial(root, artifactDir, sessionHash, turnHash);
  if (emergency) return emergency;
  const file = path.join(path.resolve(artifactDir), SUBAGENT_SKILL_AVAILABILITY_BLOCKER_FILENAME);
  try {
    const inspected = await inspectConfinedPath(path.resolve(root), file);
    if (!inspected.exists || inspected.leafSymlink || !inspected.stat?.isFile()) return null;
    const blocker: any = await readJson(file, null).catch(() => null);
    if (!validBlocker(blocker)) return null;
    return blocker.session_scope_hash === sessionHash && blocker.turn_id_hash === turnHash
      ? blocker.blockers
      : null;
  } catch {
    return null;
  }
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
): Promise<string[] | null> {
  const file = emergencyDenialPath(path.resolve(artifactDir), sessionHash, turnHash);
  try {
    const inspected = await inspectConfinedPath(path.resolve(root), file);
    if (!inspected.exists) return null;
    if (inspected.leafSymlink || !inspected.stat?.isFile()) {
      return ['subagent_skill_availability_guard_invalid'];
    }
    const blocker: any = await readJson(file, null).catch(() => null);
    if (!validBlocker(blocker)
      || blocker.session_scope_hash !== sessionHash
      || blocker.turn_id_hash !== turnHash) {
      return ['subagent_skill_availability_guard_invalid'];
    }
    return blocker.blockers;
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
  const dir = emergencyDenialDir(artifactDir);
  let inspected;
  try {
    inspected = await inspectConfinedPath(root, dir);
  } catch {
    return false;
  }
  if (!inspected.exists) return true;
  if (inspected.leafSymlink || !inspected.stat?.isDirectory()) return false;
  let names: string[];
  try {
    names = await fsp.readdir(dir);
  } catch {
    return false;
  }
  let ok = true;
  for (const name of names.filter((item) => /^deny-[a-f0-9]{64}\.json$/.test(item))) {
    const file = path.join(dir, name);
    const blocker: any = await readJson(file, null).catch(() => null);
    if (!validBlocker(blocker) || blocker.thread_id_hash !== threadHash) continue;
    try {
      const entry = await inspectConfinedPath(root, file);
      if (entry.leafSymlink || !entry.stat?.isFile()) {
        ok = false;
        continue;
      }
      await fsp.rm(file, { force: true });
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
      await fsp.rm(entry.file, { force: true });
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
  let names: string[];
  try {
    names = await fsp.readdir(dir);
  } catch {
    return null;
  }
  const records: Array<{ file: string; blocker: SubagentSkillAvailabilityBlocker | null }> = [];
  for (const name of names.filter((item) => /^deny-[a-f0-9]{64}\.json$/.test(item)).sort()) {
    const file = path.join(dir, name);
    try {
      const entry = await inspectConfinedPath(root, file);
      if (entry.leafSymlink || !entry.stat?.isFile()) {
        records.push({ file, blocker: null });
        continue;
      }
      const blocker: any = await readJson(file, null).catch(() => null);
      records.push({ file, blocker: validBlocker(blocker) ? blocker : null });
    } catch {
      records.push({ file, blocker: null });
    }
  }
  return records;
}

function preToolBlockReason(blockers: readonly string[]): string {
  return `SKS blocked this child tool call because managed skill availability failed (${blockers.join(', ')}). Return the blocker to the root parent without using tools.`;
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
