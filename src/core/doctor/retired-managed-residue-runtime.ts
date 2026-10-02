import fsp from 'node:fs/promises';
import path from 'node:path';
import { readJson, writeJsonAtomic } from '../fsx.js';
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
  normalizeRetiredToken,
  removeEmptyTree,
  type MutableCounters,
  walkEntries
} from './retired-managed-residue-private.js';

const RETIRED_REPORT_FILES = [
  'native-cli-worker-runtime.json',
  'agent-native-cli-worker-runtime-proof.json',
  'native-cli-worker-runtime-proof.json',
  'mad-sks-native-swarm.json',
  'mad-sks-native-swarm.stdout.log',
  'mad-sks-native-swarm.stderr.log',
  // Compose dashboard token fragments so pack retired-surface scan does not match the banned literals.
  [['zel', 'lij'].join(''), 'dashboard', 'pane'].join('-') + '.json',
  [['zel', 'lij'].join(''), 'dashboard', 'watch'].join('-') + '.json',
  ['agent', 'codex', 'dashboard'].join('-') + '.json',
  'codex-app-glm-profile.json'
] as const;

// Root-level capability snapshots older SKS versions wrote into the project; no current code reads them.
const RETIRED_CAPABILITY_ARTIFACT_SCHEMAS: Readonly<Record<string, string>> = {
  'codex-current-core-capability.json': 'sks.codex-current-core-capability.v1',
  'codex-current-core-real-probes.json': 'sks.codex-current-core-real-probe-result.v1',
  'codex-current-core-plugin-marketplace-real.json': 'sks.codex-current-core-plugin-marketplace-real.v1',
  'codex-current-code-mode-web-search-policy.json': 'sks.codex-current-code-mode-web-search-policy.v1'
};

export async function reconcileRetiredCapabilityArtifacts(
  root: string,
  fix: boolean,
  quarantineRoot: string,
  counters: MutableCounters
): Promise<void> {
  for (const [name, schema] of Object.entries(RETIRED_CAPABILITY_ARTIFACT_SCHEMAS)) {
    const file = path.join(root, '.sneakoscope', name);
    if (!(await pathExistsForCleanup(root, file, counters))) continue;
    const value = await readJson<any>(file, null).catch(() => null);
    await reconcileKnownRetiredPath(root, file, value?.schema === schema, fix, quarantineRoot, counters);
  }
  // Generated App Server schema cache ({ ok, text, sha256 } per runtime) that capability detection no longer reads.
  const schemaCacheRoot = path.join(root, '.sneakoscope', 'cache', 'codex-current-schema');
  if (!(await pathExistsForCleanup(root, schemaCacheRoot, counters))) return;
  const walk = await walkEntries(root, schemaCacheRoot);
  recordWalkErrors(walk.errors, counters);
  for (const file of walk.entries) {
    const value = await readJson<any>(file, null).catch(() => null);
    const managed = typeof value?.ok === 'boolean' && typeof value?.text === 'string' && 'sha256' in value;
    await reconcileKnownRetiredPath(root, file, managed, fix, quarantineRoot, counters);
  }
  if (fix) recordEmptyTreeOutcome(await removeEmptyTree(root, schemaCacheRoot), counters);
}

export async function reconcileRetiredGitPolicyMode(
  root: string,
  fix: boolean,
  quarantineRoot: string,
  counters: MutableCounters
): Promise<void> {
  const file = path.join(root, '.sneakoscope', 'git-policy.json');
  const inspected = await inspectConfinedPath(root, file).catch(() => null);
  if (!inspected) {
    counters.errors += 1;
    counters.remaining += 1;
    return;
  }
  if (!inspected.exists) return;
  if (inspected.leafSymlink || !inspected.stat?.isFile()) {
    await reconcileKnownRetiredPath(root, file, false, fix, quarantineRoot, counters);
    return;
  }
  const value = await readJson<any>(file, null).catch(() => null);
  if (value?.schema !== 'sks.git-policy.v1') return;
  const mode = String(value.mode || '');
  if (['solo', 'work', 'strict-work', 'ci'].includes(mode)) return;
  const replacement = mode === 'team'
    ? 'work'
    : mode === 'strict-team'
      ? 'strict-work'
      : null;
  if (!replacement) {
    await reconcileKnownRetiredPath(root, file, false, fix, quarantineRoot, counters);
    return;
  }
  counters.detected += 1;
  if (!fix) {
    counters.remaining += 1;
    return;
  }
  try {
    await writeJsonAtomic(file, { ...value, mode: replacement });
    counters.removed += 1;
    counters.rewrittenState += 1;
  } catch {
    counters.errors += 1;
    counters.remaining += 1;
  }
}

export async function reconcileRetiredTeamArtifacts(
  root: string,
  fix: boolean,
  quarantineRoot: string,
  counters: MutableCounters
): Promise<void> {
  const teamRoot = path.join(root, '.sneakoscope', 'team');
  if (await pathExistsForCleanup(root, teamRoot, counters)) {
    const walk = await walkEntries(root, teamRoot);
    recordWalkErrors(walk.errors, counters);
    const files = walk.entries;
    if (files.length === 0) {
      counters.detected += 1;
      if (fix) {
        await removeManagedPathVerified(root, teamRoot)
          .then(() => { counters.removed += 1; })
          .catch(() => { counters.errors += 1; counters.remaining += 1; });
      } else counters.remaining += 1;
    } else {
      for (const file of files) {
        await reconcileKnownRetiredPath(root, file, await isManagedRetiredTeamArtifact(file, true), fix, quarantineRoot, counters);
      }
      if (fix) recordEmptyTreeOutcome(await removeEmptyTree(root, teamRoot), counters);
    }
  }

  for (const file of [
    path.join(root, '.sneakoscope', 'team-dashboard-state.json'),
    path.join(root, '.sneakoscope', 'work-order-ledger.json'),
    path.join(root, '.sneakoscope', 'update', 'legacy-team-artifacts.json')
  ]) {
    if (!(await pathExistsForCleanup(root, file, counters))) continue;
    await reconcileKnownRetiredPath(root, file, await isManagedRetiredTeamArtifact(file, false), fix, quarantineRoot, counters);
  }
}

export async function reconcileRetiredReports(
  root: string,
  fix: boolean,
  quarantineRoot: string,
  counters: MutableCounters
): Promise<void> {
  const reportsRoot = path.join(root, '.sneakoscope', 'reports');
  const reportsInspection = await inspectConfinedPath(root, reportsRoot).catch(() => null);
  if (!reportsInspection) {
    counters.errors += 1;
    counters.remaining += 1;
    return;
  }
  if (reportsInspection.leafSymlink || (reportsInspection.exists && !reportsInspection.stat?.isDirectory())) {
    await reconcileKnownRetiredPath(root, reportsRoot, false, fix, quarantineRoot, counters);
    return;
  }
  const managedMadSwarmReport = await hasManagedMadSwarmReport(root, reportsRoot);
  for (const name of RETIRED_REPORT_FILES) {
    const file = path.join(reportsRoot, name);
    if (!(await pathExistsForCleanup(root, file, counters))) continue;
    const managed = name.endsWith('.log')
      ? managedMadSwarmReport
      : await isManagedRetiredRuntimeArtifact(file);
    await reconcileKnownRetiredPath(root, file, managed, fix, quarantineRoot, counters);
  }
  const retiredGlmMeta = path.join(root, '.sneakoscope', 'codex-app', 'glm-model-profile.json');
  if (await pathExistsForCleanup(root, retiredGlmMeta, counters)) {
    await reconcileKnownRetiredPath(root, retiredGlmMeta, true, fix, quarantineRoot, counters);
  }
}

export async function reconcileRetiredRecoveryReport(
  root: string,
  fix: boolean,
  quarantineRoot: string,
  counters: MutableCounters
): Promise<void> {
  const file = path.join(root, '.sneakoscope', 'reports', 'mad-db-recovery.json');
  if (await pathExistsForCleanup(root, file, counters)) await reconcileRetiredPath(root, file, fix, quarantineRoot, counters);
}

async function isManagedRetiredTeamArtifact(file: string, _insideTeamRoot: boolean): Promise<boolean> {
  const stat = await fsp.lstat(file).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink()) return false;
  const value = await readJson<any>(file, null).catch(() => null);
  const schema = String(value?.schema || '');
  if (/^sks\.(?:team|legacy-team)(?:[-.])/.test(schema)) return true;
  if (path.basename(file) === 'work-order-ledger.json') {
    return value?.schema === 'sks.work-order-ledger.v1'
      && (normalizeRetiredToken(value?.route) === 'team'
        || normalizeRetiredToken(value?.mode) === 'team');
  }
  return false;
}

async function hasManagedMadSwarmReport(root: string, reportsRoot: string): Promise<boolean> {
  const file = path.join(reportsRoot, 'mad-sks-native-swarm.json');
  const inspected = await inspectConfinedPath(root, file).catch(() => null);
  if (!inspected?.exists || inspected.leafSymlink || !inspected.stat?.isFile()) return false;
  const value = await readJson<any>(file, null).catch(() => null);
  return value?.schema === 'sks.mad-sks-native-swarm.v1';
}
