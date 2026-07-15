import path from 'node:path';
import { inspectConfinedPath } from '../managed-path-safety.js';
import { reconcileMissionArtifacts, reconcileMissionIndex } from './retired-managed-residue-missions.js';
import { type MutableCounters } from './retired-managed-residue-private.js';
import { reconcileTriWikiWrongnessProjections } from './retired-managed-projection-residue.js';
import {
  reconcileRetiredGitPolicyMode,
  reconcileRetiredRecoveryReport,
  reconcileRetiredReports,
  reconcileRetiredTeamArtifacts
} from './retired-managed-residue-runtime.js';

export async function reconcileRetiredArtifactResidue(input: {
  root: string;
  fix: boolean;
  quarantineRoot: string;
  counters: MutableCounters;
}): Promise<void> {
  const managedRoot = path.join(input.root, '.sneakoscope');
  try {
    const inspected = await inspectConfinedPath(input.root, managedRoot);
    if (!inspected.exists) return;
    if (inspected.leafSymlink || !inspected.stat?.isDirectory()) {
      input.counters.detected += 1;
      input.counters.remaining += 1;
      input.counters.errors += 1;
      return;
    }
  } catch {
    input.counters.detected += 1;
    input.counters.remaining += 1;
    input.counters.errors += 1;
    return;
  }
  await reconcileMissionArtifacts(input.root, input.fix, input.quarantineRoot, input.counters);
  await reconcileMissionIndex(input.root, input.fix, input.quarantineRoot, input.counters);
  await reconcileTriWikiWrongnessProjections(input.root, input.fix, input.quarantineRoot, input.counters);
  await reconcileRetiredTeamArtifacts(input.root, input.fix, input.quarantineRoot, input.counters);
  await reconcileRetiredReports(input.root, input.fix, input.quarantineRoot, input.counters);
  await reconcileRetiredRecoveryReport(input.root, input.fix, input.quarantineRoot, input.counters);
  await reconcileRetiredGitPolicyMode(input.root, input.fix, input.quarantineRoot, input.counters);
}
