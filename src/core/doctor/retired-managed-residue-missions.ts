import fsp from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { readJson, readText } from '../fsx.js';
import {
  inspectConfinedPath,
  removeManagedPathVerified
} from '../managed-path-safety.js';
import {
  isManagedRetiredRuntimeArtifact,
  pathExistsForCleanup,
  reconcileKnownRetiredPath,
  reconcileRetiredPath,
  recordEmptyTreeOutcome,
  recordWalkErrors
} from './retired-managed-residue-artifact-helpers.js';
import {
  isRetiredMissionIdentity,
  quarantineUserPath,
  removeEmptyTree,
  type MutableCounters,
  walkEntries
} from './retired-managed-residue-private.js';
import { reconcileMissionTrustProjection } from './retired-managed-projection-residue.js';
import { reconcileRetiredGoalArtifactResidue } from './retired-managed-residue-goal.js';

const RETIRED_DB_ROOT_FILES = new Set([
  'mad-db-capability.json',
  'mad-db-capability.closed.json',
  'mad-db-ledger.jsonl',
  'mad-db-ledger.latest.json',
  'mad-db-result.json'
]);
const RETIRED_AGENT_RUNTIME_FILES = [
  path.join('agents', 'native-cli-worker-runtime.json'),
  path.join('agents', 'native-cli-worker-runtime-proof.json'),
  'native-cli-worker-runtime.json',
  'native-cli-worker-runtime-proof.json'
] as const;
const MANAGED_MISSION_SCHEMAS = new Set([
  'sks.artifact-validation.v1',
  'sks.completion-proof.v1',
  'sks.evidence-index.v1',
  'sks.naruto-gate.v1',
  'sks.naruto-subagent-workflow.v1',
  'sks.request-intake.v1',
  'sks.route-completion-contract.v1',
  'sks.ssot-guard.v1',
  'sks.subagent-evidence.v1',
  'sks.subagent-plan.v1',
  'sks.trust-report.v1'
]);
const TEAM_ALIAS_RUNTIME_FILE = 'team-alias-to-naruto.json';
const TEAM_ALIAS_RUNTIME_SCHEMA = 'sks.team-alias-to-naruto.v1';

export async function reconcileMissionArtifacts(
  root: string,
  fix: boolean,
  quarantineRoot: string,
  counters: MutableCounters
): Promise<void> {
  const missionsRoot = path.join(root, '.sneakoscope', 'missions');
  const missionsInspection = await inspectConfinedPath(root, missionsRoot).catch(() => null);
  if (!missionsInspection) {
    counters.errors += 1;
    counters.remaining += 1;
    return;
  }
  if (!missionsInspection.exists) return;
  if (missionsInspection.leafSymlink || !missionsInspection.stat?.isDirectory()) {
    await reconcileKnownRetiredPath(root, missionsRoot, false, fix, quarantineRoot, counters);
    return;
  }
  let missions: Dirent[];
  try {
    missions = await fsp.readdir(missionsRoot, { withFileTypes: true, encoding: 'utf8' });
  } catch {
    counters.errors += 1;
    counters.remaining += 1;
    return;
  }
  for (const mission of missions) {
    const missionRoot = path.join(missionsRoot, mission.name);
    if (mission.isSymbolicLink()) {
      await reconcileKnownRetiredPath(root, missionRoot, false, fix, quarantineRoot, counters);
      continue;
    }
    if (!mission.isDirectory()) continue;
    const missionRecordPath = path.join(missionRoot, 'mission.json');
    const missionRecordInspection = await inspectConfinedPath(root, missionRecordPath).catch(() => null);
    if (missionRecordInspection?.leafSymlink) {
      await reconcileKnownRetiredPath(root, missionRecordPath, false, fix, quarantineRoot, counters);
    }
    const missionRecord = missionRecordInspection?.exists && !missionRecordInspection.leafSymlink && missionRecordInspection.stat?.isFile()
      ? await readJson<any>(missionRecordPath, {}).catch(() => ({}))
      : {};
    const retiredMission = isRetiredMissionIdentity(missionRecord);
    if (retiredMission) {
      if (await isSksOwnedRetiredMission(missionRoot, missionRecord)) {
        await reconcileSksOwnedRetiredMission(root, missionRoot, missionRecord, fix, quarantineRoot, counters);
      } else {
        await reconcileKnownRetiredPath(root, missionRoot, false, fix, quarantineRoot, counters);
      }
      continue;
    }
    await reconcileRetiredGoalArtifactResidue({ root, missionRoot, fix, quarantineRoot, counters });
    await reconcileMissionTrustProjection(root, missionRoot, fix, quarantineRoot, counters);
    await reconcileRetiredMissionRuntime(root, missionRoot, fix, quarantineRoot, counters);
    for (const name of RETIRED_DB_ROOT_FILES) {
      const file = path.join(missionRoot, name);
      if (!(await pathExistsForCleanup(root, file, counters))) continue;
      await reconcileRetiredPath(root, file, fix, quarantineRoot, counters);
    }
    const retiredDir = path.join(missionRoot, 'mad-db');
    if (!(await pathExistsForCleanup(root, retiredDir, counters))) continue;
    const walk = await walkEntries(root, retiredDir);
    recordWalkErrors(walk.errors, counters);
    const files = walk.entries;
    if (!files.length) {
      counters.detected += 1;
      if (fix) {
        await removeManagedPathVerified(root, retiredDir)
          .then(() => { counters.removed += 1; })
          .catch(() => { counters.errors += 1; counters.remaining += 1; });
      } else {
        counters.remaining += 1;
      }
      continue;
    }
    for (const file of files) await reconcileRetiredPath(root, file, fix, quarantineRoot, counters);
    if (fix) recordEmptyTreeOutcome(await removeEmptyTree(root, retiredDir), counters);
  }
}

export async function reconcileMissionIndex(
  root: string,
  fix: boolean,
  quarantineRoot: string,
  counters: MutableCounters
): Promise<void> {
  const file = path.join(root, '.sneakoscope', 'missions', 'index.json');
  const inspected = await inspectConfinedPath(root, file).catch(() => null);
  if (!inspected) {
    counters.detected += 1;
    counters.errors += 1;
    counters.remaining += 1;
    return;
  }
  if (!inspected.exists) return;
  if (inspected.leafSymlink) {
    await reconcileKnownRetiredPath(root, file, false, fix, quarantineRoot, counters);
    return;
  }
  const value = await readJson<any>(file, null).catch(() => null);
  if (!value || !Array.isArray(value.missions)) return;
  const retiredCount = value.missions.filter((row: any) => isRetiredMissionIdentity(row)).length;
  if (retiredCount === 0) return;
  counters.detected += retiredCount;
  if (!fix) {
    counters.remaining += retiredCount;
    if (value.schema !== 'sks.mission-index.v1') counters.preserved += 1;
    return;
  }
  try {
    if (value.schema !== 'sks.mission-index.v1') {
      await quarantineUserPath(root, file, quarantineRoot);
      counters.preserved += 1;
    }
    const { refreshMissionIndex } = await import('../retention.js');
    await refreshMissionIndex(root);
    counters.removed += retiredCount;
    counters.rewrittenState += 1;
  } catch {
    counters.errors += 1;
    counters.remaining += retiredCount;
  }
}

async function reconcileSksOwnedRetiredMission(
  root: string,
  missionRoot: string,
  missionRecord: any,
  fix: boolean,
  quarantineRoot: string,
  counters: MutableCounters
): Promise<void> {
  await reconcileRetiredMissionRuntime(root, missionRoot, fix, quarantineRoot, counters);
  for (const name of RETIRED_DB_ROOT_FILES) {
    const file = path.join(missionRoot, name);
    if (await pathExistsForCleanup(root, file, counters)) await reconcileRetiredPath(root, file, fix, quarantineRoot, counters);
  }
  const retiredDir = path.join(missionRoot, 'mad-db');
  if (await pathExistsForCleanup(root, retiredDir, counters)) {
    const walk = await walkEntries(root, retiredDir);
    recordWalkErrors(walk.errors, counters);
    const files = walk.entries;
    if (!files.length) {
      await reconcileKnownRetiredPath(root, retiredDir, true, fix, quarantineRoot, counters);
    } else {
      for (const file of files) await reconcileRetiredPath(root, file, fix, quarantineRoot, counters);
      if (fix) recordEmptyTreeOutcome(await removeEmptyTree(root, retiredDir), counters);
    }
  }
  const missionWalk = await walkEntries(root, missionRoot);
  recordWalkErrors(missionWalk.errors, counters);
  for (const file of missionWalk.entries) {
    await reconcileKnownRetiredPath(
      root,
      file,
      await isManagedRetiredMissionFile(missionRoot, file, missionRecord),
      fix,
      quarantineRoot,
      counters
    );
  }
  if (fix) recordEmptyTreeOutcome(await removeEmptyTree(root, missionRoot), counters);
}

async function isManagedRetiredMissionFile(missionRoot: string, file: string, missionRecord: any): Promise<boolean> {
  const stat = await fsp.lstat(file).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink()) return false;
  const relative = path.relative(missionRoot, file).split(path.sep).join('/');
  if (relative === 'mission.json') {
    const value = await readJson<any>(file, null).catch(() => null);
    return value?.id === missionRecord?.id && isRetiredMissionIdentity(value);
  }
  if (relative === 'events.jsonl') {
    const text = await readText(file, '');
    return text.split(/\r?\n/).some((line) => {
      if (!line.trim()) return false;
      try {
        const event = JSON.parse(line);
        return event?.type === 'mission.created'
          && event?.mission === missionRecord?.id
          && isRetiredMissionIdentity(event);
      } catch {
        return false;
      }
    });
  }
  const value = await readJson<any>(file, null).catch(() => null);
  return MANAGED_MISSION_SCHEMAS.has(String(value?.schema || ''));
}

async function reconcileRetiredMissionRuntime(
  root: string,
  missionRoot: string,
  fix: boolean,
  quarantineRoot: string,
  counters: MutableCounters
): Promise<void> {
  const madArtifact = path.join(missionRoot, 'mad-sks-native-swarm.json');
  const madArtifactInspection = await inspectConfinedPath(root, madArtifact).catch(() => null);
  const madArtifactValue = madArtifactInspection?.exists && !madArtifactInspection.leafSymlink && madArtifactInspection.stat?.isFile()
    ? await readJson<any>(madArtifact, null).catch(() => null)
    : null;
  const madArtifactManaged = madArtifactValue?.schema === 'sks.mad-sks-native-swarm.v1';
  for (const name of ['mad-sks-native-swarm.json', 'mad-sks-native-swarm.stdout.log', 'mad-sks-native-swarm.stderr.log']) {
    const file = path.join(missionRoot, name);
    if (await pathExistsForCleanup(root, file, counters)) {
      await reconcileKnownRetiredPath(root, file, madArtifactManaged, fix, quarantineRoot, counters);
    }
  }

  const teamAliasFile = path.join(missionRoot, TEAM_ALIAS_RUNTIME_FILE);
  if (await pathExistsForCleanup(root, teamAliasFile, counters)) {
    const aliasInspection = await inspectConfinedPath(root, teamAliasFile).catch(() => null);
    const value = aliasInspection?.exists && !aliasInspection.leafSymlink && aliasInspection.stat?.isFile()
      ? await readJson<any>(teamAliasFile, null).catch(() => null)
      : null;
    await reconcileKnownRetiredPath(
      root,
      teamAliasFile,
      value?.schema === TEAM_ALIAS_RUNTIME_SCHEMA,
      fix,
      quarantineRoot,
      counters
    );
  }

  const agentsRoot = path.join(missionRoot, 'agents');
  const agentsInspection = await inspectConfinedPath(root, agentsRoot).catch(() => null);
  if (!agentsInspection) {
    counters.errors += 1;
    counters.remaining += 1;
  } else if (agentsInspection.leafSymlink) {
    await reconcileKnownRetiredPath(root, agentsRoot, false, fix, quarantineRoot, counters);
  } else {
    for (const relative of RETIRED_AGENT_RUNTIME_FILES) {
      const file = path.join(missionRoot, relative);
      if (await pathExistsForCleanup(root, file, counters)) {
        await reconcileKnownRetiredPath(
          root,
          file,
          await isManagedRetiredRuntimeArtifact(file),
          fix,
          quarantineRoot,
          counters
        );
      }
    }
    const sessionsRoot = path.join(missionRoot, 'agents', 'sessions');
    if (await pathExistsForCleanup(root, sessionsRoot, counters)) {
      await reconcileRetiredSessionTree(root, sessionsRoot, fix, quarantineRoot, counters);
    }
  }
}

async function isSksOwnedRetiredMission(missionRoot: string, missionRecord: any): Promise<boolean> {
  const stat = await fsp.lstat(missionRoot).catch(() => null);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) return false;
  const id = path.basename(missionRoot);
  const recordShapeMatches = missionRecord?.id === id
    && isRetiredMissionIdentity(missionRecord)
    && typeof missionRecord?.prompt === 'string'
    && typeof missionRecord?.created_at === 'string'
    && Number.isFinite(Date.parse(missionRecord.created_at))
    && typeof missionRecord?.phase === 'string'
    && typeof missionRecord?.questions_allowed === 'boolean'
    && typeof missionRecord?.implementation_allowed === 'boolean';
  if (!recordShapeMatches) return false;
  const eventsFile = path.join(missionRoot, 'events.jsonl');
  const eventsStat = await fsp.lstat(eventsFile).catch(() => null);
  if (!eventsStat?.isFile() || eventsStat.isSymbolicLink()) return false;
  const events = await readText(eventsFile, '');
  return events.split(/\r?\n/).some((line) => {
    if (!line.trim()) return false;
    try {
      const event = JSON.parse(line);
      return event?.type === 'mission.created'
        && event?.mission === id
        && isRetiredMissionIdentity(event);
    } catch {
      return false;
    }
  });
}

async function reconcileRetiredSessionTree(
  root: string,
  sessionsRoot: string,
  fix: boolean,
  quarantineRoot: string,
  counters: MutableCounters
): Promise<void> {
  const stat = await fsp.lstat(sessionsRoot).catch(() => null);
  if (stat?.isSymbolicLink()) {
    await reconcileKnownRetiredPath(root, sessionsRoot, false, fix, quarantineRoot, counters);
    return;
  }
  if (!stat?.isDirectory()) return;
  const walk = await walkEntries(root, sessionsRoot);
  recordWalkErrors(walk.errors, counters);
  const files = walk.entries;
  if (files.length === 0) {
    await reconcileKnownRetiredPath(root, sessionsRoot, true, fix, quarantineRoot, counters);
    return;
  }
  const classified = await Promise.all(files.map(async (file) => ({
    file,
    managed: await isManagedRetiredSessionFile(file)
  })));
  if (!classified.some((entry) => entry.managed)) return;
  for (const entry of classified) {
    await reconcileKnownRetiredPath(root, entry.file, entry.managed, fix, quarantineRoot, counters);
  }
  if (fix) recordEmptyTreeOutcome(await removeEmptyTree(root, sessionsRoot), counters);
}

async function isManagedRetiredSessionFile(file: string): Promise<boolean> {
  const fileStat = await fsp.lstat(file).catch(() => null);
  if (!fileStat?.isFile() || fileStat.isSymbolicLink()) return false;
  const value = await readJson<any>(file, null).catch(() => null);
  const schema = String(value?.schema || '');
  return /^sks\.(?:native-cli|agent-native|native-worker|worker-session)/.test(schema);
}
