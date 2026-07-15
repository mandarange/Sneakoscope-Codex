import fsp from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { readJson, writeJsonAtomic } from '../fsx.js';
import { inspectConfinedPath } from '../managed-path-safety.js';
import {
  isRetiredMissionMode,
  quarantineUserPath,
  type MutableCounters
} from './retired-managed-residue-private.js';

const TRUST_REPORT_SCHEMA = 'sks.trust-report.v1';
const GIT_COLLABORATION_TRUST_SCHEMA = 'sks.git-collaboration-trust.v1';
const WRONGNESS_WRAPPER_SCHEMA = 'sks.triwiki-wrongness-record.v1';
const WRONGNESS_RECORD_SCHEMA = 'sks.triwiki-wrongness.v1';
const WRONGNESS_INDEX_SCHEMA = 'sks.triwiki-wrongness-index.v1';
const WRONGNESS_LEDGER_SCHEMA = 'sks.triwiki-wrongness-ledger.v1';

type JsonRecord = Record<string, any>;
type ProjectionClassification =
  | { kind: 'none' }
  | { kind: 'collision' }
  | { kind: 'managed'; value: JsonRecord };

export async function reconcileMissionTrustProjection(
  root: string,
  missionRoot: string,
  fix: boolean,
  quarantineRoot: string,
  counters: MutableCounters
): Promise<void> {
  await reconcileProjectionFile(
    root,
    path.join(missionRoot, 'trust-report.json'),
    fix,
    quarantineRoot,
    counters,
    classifyTrustProjection
  );
}

export async function reconcileTriWikiWrongnessProjections(
  root: string,
  fix: boolean,
  quarantineRoot: string,
  counters: MutableCounters
): Promise<void> {
  const wikiRoot = path.join(root, '.sneakoscope', 'wiki');
  const wikiInspection = await inspectConfinedPath(root, wikiRoot).catch(() => null);
  if (!wikiInspection) {
    recordInspectionFailure(counters);
    return;
  }
  if (!wikiInspection.exists) return;
  if (wikiInspection.leafSymlink || !wikiInspection.stat?.isDirectory()) {
    await preserveCollision(root, wikiRoot, fix, quarantineRoot, counters);
    return;
  }

  await reconcileProjectionFile(
    root,
    path.join(wikiRoot, 'wrongness-index.json'),
    fix,
    quarantineRoot,
    counters,
    classifyWrongnessIndexProjection
  );
  await reconcileProjectionFile(
    root,
    path.join(wikiRoot, 'wrongness-ledger.json'),
    fix,
    quarantineRoot,
    counters,
    classifyWrongnessLedgerProjection
  );
  await reconcileWrongnessRecordFiles(root, wikiRoot, fix, quarantineRoot, counters);
}

async function reconcileWrongnessRecordFiles(
  root: string,
  wikiRoot: string,
  fix: boolean,
  quarantineRoot: string,
  counters: MutableCounters
): Promise<void> {
  const recordsRoot = path.join(wikiRoot, 'wrongness');
  const inspected = await inspectConfinedPath(root, recordsRoot).catch(() => null);
  if (!inspected) {
    recordInspectionFailure(counters);
    return;
  }
  if (!inspected.exists) return;
  if (inspected.leafSymlink || !inspected.stat?.isDirectory()) {
    await preserveCollision(root, recordsRoot, fix, quarantineRoot, counters);
    return;
  }

  let entries: Dirent[];
  try {
    entries = await fsp.readdir(recordsRoot, { withFileTypes: true, encoding: 'utf8' });
  } catch {
    recordInspectionFailure(counters);
    return;
  }
  for (const entry of entries) {
    if (!entry.name.endsWith('.json')) continue;
    await reconcileProjectionFile(
      root,
      path.join(recordsRoot, entry.name),
      fix,
      quarantineRoot,
      counters,
      classifyWrongnessRecordProjection
    );
  }
}

async function reconcileProjectionFile(
  root: string,
  file: string,
  fix: boolean,
  quarantineRoot: string,
  counters: MutableCounters,
  classify: (value: unknown) => ProjectionClassification
): Promise<void> {
  const inspected = await inspectConfinedPath(root, file).catch(() => null);
  if (!inspected) {
    recordInspectionFailure(counters);
    return;
  }
  if (!inspected.exists) return;
  if (inspected.leafSymlink || !inspected.stat?.isFile()) {
    await preserveCollision(root, file, fix, quarantineRoot, counters);
    return;
  }

  const classification = classify(await readJson<unknown>(file, null).catch(() => null));
  if (classification.kind === 'none') return;
  if (classification.kind === 'collision') {
    await preserveCollision(root, file, fix, quarantineRoot, counters);
    return;
  }

  counters.detected += 1;
  if (!fix) {
    counters.remaining += 1;
    return;
  }
  try {
    const beforeWrite = await inspectConfinedPath(root, file);
    if (!beforeWrite.exists || beforeWrite.leafSymlink || !beforeWrite.stat?.isFile()) {
      throw new Error('retired_projection_write_target_changed');
    }
    await writeJsonAtomic(file, classification.value);
    const afterWrite = await inspectConfinedPath(root, file);
    if (!afterWrite.exists || afterWrite.leafSymlink || !afterWrite.stat?.isFile()) {
      throw new Error('retired_projection_write_verification_failed');
    }
    if (classify(await readJson<unknown>(file, null)).kind !== 'none') {
      throw new Error('retired_projection_identity_remains');
    }
    counters.removed += 1;
    counters.rewrittenState += 1;
  } catch {
    counters.errors += 1;
    counters.remaining += 1;
  }
}

async function preserveCollision(
  root: string,
  file: string,
  fix: boolean,
  quarantineRoot: string,
  counters: MutableCounters
): Promise<void> {
  counters.detected += 1;
  if (!fix) {
    counters.preserved += 1;
    counters.remaining += 1;
    return;
  }
  try {
    await quarantineUserPath(root, file, quarantineRoot);
    counters.preserved += 1;
  } catch {
    counters.errors += 1;
    counters.remaining += 1;
  }
}

function classifyTrustProjection(value: unknown): ProjectionClassification {
  const report = asJsonRecord(value);
  const collaboration = asJsonRecord(report.git_collaboration);
  const replacement = collaboration.mode === 'team'
    ? 'work'
    : collaboration.mode === 'strict-team'
      ? 'strict-work'
      : null;
  if (!replacement) return { kind: 'none' };
  if (report.schema !== TRUST_REPORT_SCHEMA || collaboration.schema !== GIT_COLLABORATION_TRUST_SCHEMA) {
    return { kind: 'collision' };
  }
  return {
    kind: 'managed',
    value: { ...report, git_collaboration: { ...collaboration, mode: replacement } }
  };
}

function classifyWrongnessRecordProjection(value: unknown): ProjectionClassification {
  const wrapper = asJsonRecord(value);
  const wrongness = asJsonRecord(wrapper.wrongness);
  if (!isRetiredMissionMode(wrongness.route)) return { kind: 'none' };
  if (wrapper.schema !== WRONGNESS_WRAPPER_SCHEMA || wrongness.schema !== WRONGNESS_RECORD_SCHEMA) {
    return { kind: 'collision' };
  }
  return {
    kind: 'managed',
    value: { ...wrapper, wrongness: { ...wrongness, route: null } }
  };
}

function classifyWrongnessIndexProjection(value: unknown): ProjectionClassification {
  const index = asJsonRecord(value);
  const records = Array.isArray(index.records) ? index.records : [];
  if (!records.some((record) => isRetiredMissionMode(asJsonRecord(record).route))) return { kind: 'none' };
  if (index.schema !== WRONGNESS_INDEX_SCHEMA) return { kind: 'collision' };
  return {
    kind: 'managed',
    value: {
      ...index,
      records: records.map((record) => {
        const row = asJsonRecord(record);
        return isRetiredMissionMode(row.route) ? { ...row, route: null } : record;
      })
    }
  };
}

function classifyWrongnessLedgerProjection(value: unknown): ProjectionClassification {
  const ledger = asJsonRecord(value);
  const records = Array.isArray(ledger.records) ? ledger.records : [];
  if (!records.some((record) => isRetiredMissionMode(asJsonRecord(record).route))) return { kind: 'none' };
  if (ledger.schema !== WRONGNESS_LEDGER_SCHEMA
    || records.some((record) => asJsonRecord(record).schema !== WRONGNESS_RECORD_SCHEMA)) {
    return { kind: 'collision' };
  }
  return {
    kind: 'managed',
    value: {
      ...ledger,
      records: records.map((record) => {
        const row = asJsonRecord(record);
        return isRetiredMissionMode(row.route) ? { ...row, route: null } : row;
      })
    }
  };
}

function recordInspectionFailure(counters: MutableCounters): void {
  counters.errors += 1;
  counters.remaining += 1;
}

function asJsonRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
