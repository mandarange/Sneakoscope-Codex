import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  applyMenuBarGenerationTransaction,
  commitMenuBarGenerationTransaction,
  installGenerationPairs,
  MenuBarGenerationTransactionError,
  recoverMenuBarGenerationTransaction,
  rollbackGenerationPairs
} from '../menubar/generation-transaction.js';
import { sksMenuBarPaths } from '../menubar/paths.js';
import type { SksMenuBarGenerationArtifact } from '../menubar/types.js';

const ARTIFACTS: SksMenuBarGenerationArtifact[] = ['app', 'build_stamp', 'action_script', 'launch_agent'];
const INSTALL_OPERATIONS = ['backup_to_displaced', 'staged_to_backup', 'active_to_temp', 'backup_to_active', 'temp_to_backup'];
const SWAP_OPERATIONS = ['active_to_temp', 'backup_to_active', 'temp_to_backup'];
const PHASES = ['before', 'after'] as const;

test('install generation transaction recovers the original active and previous generation after every forward rename cutpoint', async () => {
  for (const kind of ARTIFACTS) {
    for (const operation of INSTALL_OPERATIONS) {
      for (const phase of PHASES) {
        const fixture = await createFixture(true);
        const point = `install:${kind}:${operation}:${phase}`;
        try {
          await assert.rejects(
            applyMenuBarGenerationTransaction({
              purpose: 'install',
              journalPath: fixture.paths.install_transaction_path,
              pairs: installGenerationPairs(fixture.paths),
              env: { SKS_MENUBAR_TRANSACTION_FAULT_AT: point }
            }),
            (error: unknown) => {
              assert.ok(error instanceof MenuBarGenerationTransactionError, point);
              assert.equal(error.outcome.failure_pair, kind, point);
              assert.equal(error.outcome.failure_point, `${operation}:${phase}`, point);
              return true;
            }
          );
          const recovered = await recoverMenuBarGenerationTransaction({
            purpose: 'install',
            journalPath: fixture.paths.install_transaction_path,
            pairs: installGenerationPairs(fixture.paths)
          });
          assert.equal(recovered.ok, true, `${point}: ${JSON.stringify(recovered)}`);
          assert.equal(recovered.status, 'rolled_back', point);
          await assertGeneration(fixture.paths, 'active', 'previous', false, point);
        } finally {
          await fixture.cleanup();
        }
      }
    }
  }
});

test('install generation recovery remains resumable after every reverse rename cutpoint', async () => {
  for (const kind of ARTIFACTS) {
    for (const operation of INSTALL_OPERATIONS) {
      for (const phase of PHASES) {
        const fixture = await createFixture(true);
        const point = `install:${kind}:recover_${operation}:${phase}`;
        try {
          const applied = await applyMenuBarGenerationTransaction({
            purpose: 'install', journalPath: fixture.paths.install_transaction_path, pairs: installGenerationPairs(fixture.paths)
          });
          assert.equal(applied.ok, true, point);
          const interrupted = await recoverMenuBarGenerationTransaction({
            purpose: 'install',
            journalPath: fixture.paths.install_transaction_path,
            pairs: installGenerationPairs(fixture.paths),
            env: { SKS_MENUBAR_TRANSACTION_FAULT_AT: point }
          });
          assert.equal(interrupted.ok, false, point);
          assert.equal(interrupted.status, 'terminal_uncertain', point);
          assert.equal(interrupted.recovery_failure_pair, kind, point);
          assert.equal(interrupted.recovery_failure_point, `recover_${operation}:${phase}`, point);
          const resumed = await recoverMenuBarGenerationTransaction({
            purpose: 'install', journalPath: fixture.paths.install_transaction_path, pairs: installGenerationPairs(fixture.paths)
          });
          assert.equal(resumed.ok, true, `${point}: ${JSON.stringify(resumed)}`);
          await assertGeneration(fixture.paths, 'active', 'previous', false, point);
        } finally {
          await fixture.cleanup();
        }
      }
    }
  }
});

test('rollback swap journal recovers the current failing pair after every forward and reverse rename cutpoint', async () => {
  for (const recovery of [false, true]) {
    for (const kind of ARTIFACTS) {
      for (const operation of SWAP_OPERATIONS) {
        for (const phase of PHASES) {
          const fixture = await createFixture(false);
          const point = `rollback:${kind}:${recovery ? 'recover_' : ''}${operation}:${phase}`;
          try {
            if (recovery) {
              await applyMenuBarGenerationTransaction({
                purpose: 'rollback', journalPath: fixture.paths.rollback_transaction_path, pairs: rollbackGenerationPairs(fixture.paths)
              });
              const interrupted = await recoverMenuBarGenerationTransaction({
                purpose: 'rollback',
                journalPath: fixture.paths.rollback_transaction_path,
                pairs: rollbackGenerationPairs(fixture.paths),
                env: { SKS_MENUBAR_TRANSACTION_FAULT_AT: point }
              });
              assert.equal(interrupted.ok, false, point);
              assert.equal(interrupted.recovery_failure_pair, kind, point);
            } else {
              await assert.rejects(applyMenuBarGenerationTransaction({
                purpose: 'rollback',
                journalPath: fixture.paths.rollback_transaction_path,
                pairs: rollbackGenerationPairs(fixture.paths),
                env: { SKS_MENUBAR_TRANSACTION_FAULT_AT: point }
              }), MenuBarGenerationTransactionError, point);
            }
            const resumed = await recoverMenuBarGenerationTransaction({
              purpose: 'rollback', journalPath: fixture.paths.rollback_transaction_path, pairs: rollbackGenerationPairs(fixture.paths)
            });
            assert.equal(resumed.ok, true, `${point}: ${JSON.stringify(resumed)}`);
            await assertGeneration(fixture.paths, 'active', 'previous', false, point);
          } finally {
            await fixture.cleanup();
          }
        }
      }
    }
  }
});

test('committed install generation keeps new active artifacts and the immediately replaced generation as previous', async () => {
  const fixture = await createFixture(true);
  try {
    const pairs = installGenerationPairs(fixture.paths);
    const applied = await applyMenuBarGenerationTransaction({
      purpose: 'install', journalPath: fixture.paths.install_transaction_path, pairs
    });
    assert.equal(applied.ok, true);
    await assertGeneration(fixture.paths, 'next', 'active', false, 'applied');
    const committed = await commitMenuBarGenerationTransaction({
      purpose: 'install', journalPath: fixture.paths.install_transaction_path, pairs
    });
    assert.equal(committed.ok, true, JSON.stringify(committed));
    assert.equal(committed.status, 'committed');
    assert.equal(await exists(fixture.paths.install_transaction_path), false);
    await assertGeneration(fixture.paths, 'next', 'active', false, 'committed');
  } finally {
    await fixture.cleanup();
  }
});

async function createFixture(withStaging: boolean) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-generation-'));
  const paths = sksMenuBarPaths(path.join(temp, 'home'), path.join(temp, 'root'));
  const installPairs = installGenerationPairs(paths);
  for (const pair of installPairs) {
    await writeArtifact(pair.kind, pair.active, 'active');
    await writeArtifact(pair.kind, pair.backup, 'previous');
    if (withStaging && pair.staged) await writeArtifact(pair.kind, pair.staged, 'next');
  }
  return { paths, cleanup: () => fs.rm(temp, { recursive: true, force: true }) };
}

async function assertGeneration(
  paths: ReturnType<typeof sksMenuBarPaths>,
  activeMarker: string,
  backupMarker: string,
  stagedExpected: boolean,
  label: string
) {
  for (const pair of installGenerationPairs(paths)) {
    assert.equal(await readArtifact(pair.kind, pair.active), activeMarker, `${label}:${pair.kind}:active`);
    assert.equal(await readArtifact(pair.kind, pair.backup), backupMarker, `${label}:${pair.kind}:backup`);
    assert.equal(pair.staged ? await exists(pair.staged) : false, stagedExpected, `${label}:${pair.kind}:staged`);
  }
}

async function writeArtifact(kind: SksMenuBarGenerationArtifact, target: string, marker: string): Promise<void> {
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (kind === 'app') {
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, 'generation.txt'), `${marker}\n`);
    return;
  }
  await fs.writeFile(target, `${marker}\n`, { mode: kind === 'action_script' ? 0o755 : 0o600 });
}

async function readArtifact(kind: SksMenuBarGenerationArtifact, target: string): Promise<string | null> {
  if (!(await exists(target))) return null;
  const file = kind === 'app' ? path.join(target, 'generation.txt') : target;
  return (await fs.readFile(file, 'utf8')).trim();
}

async function exists(target: string): Promise<boolean> {
  return fs.lstat(target).then(() => true).catch(() => false);
}
