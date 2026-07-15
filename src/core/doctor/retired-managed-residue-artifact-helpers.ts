import fsp from 'node:fs/promises';
import path from 'node:path';
import { readJson, readText } from '../fsx.js';
import {
  inspectConfinedPath,
  removeManagedPathVerified,
  type EmptyTreeRemovalResult
} from '../managed-path-safety.js';
import {
  quarantineUserPath,
  type MutableCounters
} from './retired-managed-residue-private.js';

const RETIRED_DB_SCHEMA_RE = /^sks\.mad-db-(?:capability|cycle-result|ledger-event|lifecycle-pending|operation|policy|prepared-mission|read-back-proof|read-only-restoration|recovery|runtime-profile|target|tool-inventory|tool-result|tool-result-lifecycle)\./;

export async function reconcileRetiredPath(
  root: string,
  file: string,
  fix: boolean,
  quarantineRoot: string,
  counters: MutableCounters
): Promise<void> {
  const inspected = await inspectConfinedPath(root, file).catch(() => null);
  if (!inspected) {
    counters.detected += 1;
    counters.errors += 1;
    counters.remaining += 1;
    return;
  }
  const managed = inspected.leafSymlink ? false : await isManagedRetiredDbArtifact(file);
  counters.detected += 1;
  if (!fix) {
    counters.remaining += 1;
    if (!managed) counters.preserved += 1;
    return;
  }
  try {
    if (managed) {
      await removeManagedPathVerified(root, file);
      counters.removed += 1;
    } else {
      await quarantineUserPath(root, file, quarantineRoot);
      counters.preserved += 1;
    }
  } catch {
    counters.errors += 1;
    counters.remaining += 1;
  }
}

export async function reconcileKnownRetiredPath(
  root: string,
  file: string,
  managed: boolean,
  fix: boolean,
  quarantineRoot: string,
  counters: MutableCounters
): Promise<void> {
  const inspected = await inspectConfinedPath(root, file).catch(() => null);
  if (!inspected) {
    counters.detected += 1;
    counters.errors += 1;
    counters.remaining += 1;
    return;
  }
  const sksManaged = managed && !inspected.leafSymlink;
  counters.detected += 1;
  if (!fix) {
    counters.remaining += 1;
    if (!sksManaged) counters.preserved += 1;
    return;
  }
  try {
    if (sksManaged) {
      await removeManagedPathVerified(root, file);
      counters.removed += 1;
    } else {
      await quarantineUserPath(root, file, quarantineRoot);
      counters.preserved += 1;
    }
  } catch {
    counters.errors += 1;
    counters.remaining += 1;
  }
}

export async function isManagedRetiredRuntimeArtifact(file: string): Promise<boolean> {
  if (path.basename(file).endsWith('.log')) return false;
  const value = await readJson<any>(file, null).catch(() => null);
  const schema = String(value?.schema || '');
  return schema === 'sks.native-cli-worker-runtime.v2'
    || schema === 'sks.native-cli-worker-runtime-proof.v1'
    || schema === 'sks.native-cli-worker-runtime-check.v2'
    || schema === 'sks.mad-sks-native-swarm.v1';
}

export function recordWalkErrors(errors: string[], counters: MutableCounters): void {
  if (!errors.length) return;
  counters.errors += errors.length;
  counters.remaining += errors.length;
}

export function recordEmptyTreeOutcome(outcome: EmptyTreeRemovalResult, counters: MutableCounters): void {
  if (outcome.errors.length) counters.errors += outcome.errors.length;
  if (outcome.remaining_paths.length) counters.remaining += outcome.remaining_paths.length;
}

export async function pathExistsForCleanup(root: string, target: string, counters: MutableCounters): Promise<boolean> {
  try {
    return (await inspectConfinedPath(root, target)).exists;
  } catch {
    counters.detected += 1;
    counters.errors += 1;
    counters.remaining += 1;
    return false;
  }
}

async function isManagedRetiredDbArtifact(file: string): Promise<boolean> {
  const stat = await fsp.lstat(file).catch(() => null);
  if (!stat) return true;
  if (stat.isDirectory()) return path.basename(file).endsWith('.lock') || path.basename(file).includes('.lock.stale-');
  if (!stat.isFile()) return false;
  const rel = file.split(path.sep).join('/');
  const name = path.basename(file);
  const text = await readText(file, '');
  if (name === 'codex-mad-db.config.toml' || name.startsWith('codex-mad-db.config.toml.')) return /\[mcp_servers\.supabase_mad_db\]/.test(text);
  if (name === 'mad-db-ledger.jsonl') {
    return text.split(/\r?\n/).some((line) => {
      if (!line.trim()) return false;
      try {
        const event = JSON.parse(line);
        return /^(?:capability\.|db_operation\.|db_mutation\.)/.test(String(event?.type || ''));
      } catch {
        return false;
      }
    });
  }
  const value = await readJson<any>(file, null).catch(() => null);
  const schema = String(value?.schema || '');
  if (RETIRED_DB_SCHEMA_RE.test(schema)) return true;
  if (rel.includes('/mad-db/runtime/locks/') && name === 'owner.json') return schema === 'sks.file-lock-owner.v1';
  return false;
}
