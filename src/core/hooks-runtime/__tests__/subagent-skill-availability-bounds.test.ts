import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { sha256 } from '../../fsx.js';
import {
  SUBAGENT_SKILL_AVAILABILITY_BLOCKER_FILENAME,
  subagentSkillAvailabilityRunBlockers
} from '../subagent-skill-availability.js';

const missionId = 'M-bounded-lifecycle-guards';
const workflowRunId = 'run-bounded-lifecycle-guards';
const blockerCode = 'authoritative_sks_skill_resolution_failed';

function admission(index: number) {
  return {
    schema: 'sks.subagent-skill-availability-admission.v1',
    status: 'blocked',
    mission_id: missionId,
    workflow_run_id: workflowRunId,
    thread_id_hash: sha256(`thread-${index}`),
    session_scope_hash: sha256(`session-${index}`),
    turn_id_hash: sha256(`turn-${index}`),
    blockers: [blockerCode],
    recorded_at: new Date(index * 1000).toISOString()
  };
}

function denial(index = 0) {
  return {
    schema: 'sks.subagent-skill-availability-blocker.v1',
    status: 'blocked',
    mission_id: missionId,
    workflow_run_id: workflowRunId,
    thread_id_hash: sha256(`thread-${index}`),
    session_scope_hash: sha256(`session-${index}`),
    turn_id_hash: sha256(`turn-${index}`),
    blockers: [blockerCode],
    recorded_at: new Date(index * 1000).toISOString()
  };
}

async function fixture(prefix: string) {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  const root = path.join(base, 'project');
  const artifactDir = path.join(root, '.sneakoscope', 'missions', missionId);
  await fsp.mkdir(artifactDir, { recursive: true });
  return { base, root, artifactDir };
}

async function run(root: string, artifactDir: string) {
  return subagentSkillAvailabilityRunBlockers(
    root,
    artifactDir,
    missionId,
    workflowRunId
  );
}

async function writeRetentionStub(file: string, expanded: unknown) {
  const original = Buffer.from(JSON.stringify(expanded));
  await fsp.writeFile(`${file}.gz`, gzipSync(original));
  await fsp.writeFile(file, JSON.stringify({
    retention_archived: true,
    retention_archive: {
      source_path: path.basename(file),
      gzip_path: `${path.basename(file)}.gz`,
      original_sha256: sha256(original)
    }
  }));
}

test('lifecycle guard enumeration fails closed at entry 65 before opening records', async (t) => {
  await t.test('admissions', async () => {
    const { base, root, artifactDir } = await fixture('sks-guard-admission-entry-limit-');
    try {
      const guardDir = path.join(artifactDir, 'subagent-skill-availability');
      await fsp.mkdir(guardDir, { recursive: true });
      for (let index = 0; index < 65; index += 1) {
        const record = admission(index);
        await fsp.writeFile(
          path.join(guardDir, `thread-${record.thread_id_hash}.json`),
          JSON.stringify(record)
        );
      }

      assert.deepEqual(await run(root, artifactDir), ['subagent_skill_availability_guard_invalid']);
    } finally {
      await fsp.rm(base, { recursive: true, force: true });
    }
  });

  await t.test('emergency denials', async () => {
    const { base, root, artifactDir } = await fixture('sks-guard-denial-entry-limit-');
    try {
      const denialDir = path.join(artifactDir, 'subagent-skill-availability-emergency-denials');
      await fsp.mkdir(denialDir, { recursive: true });
      for (let index = 0; index < 65; index += 1) {
        await fsp.writeFile(
          path.join(denialDir, `deny-${sha256(`denial-${index}`)}.json`),
          JSON.stringify(denial(index))
        );
      }

      assert.deepEqual(await run(root, artifactDir), ['subagent_skill_availability_guard_invalid']);
    } finally {
      await fsp.rm(base, { recursive: true, force: true });
    }
  });
});

test('bounded lifecycle scans preserve mission and workflow filtering', async () => {
  const { base, root, artifactDir } = await fixture('sks-guard-run-filter-');
  try {
    const guardDir = path.join(artifactDir, 'subagent-skill-availability');
    const denialDir = path.join(artifactDir, 'subagent-skill-availability-emergency-denials');
    await Promise.all([
      fsp.mkdir(guardDir, { recursive: true }),
      fsp.mkdir(denialDir, { recursive: true })
    ]);
    const otherMission = { ...admission(70), mission_id: 'M-other' };
    const otherRun = { ...denial(71), workflow_run_id: 'run-other' };
    await Promise.all([
      fsp.writeFile(
        path.join(guardDir, `thread-${otherMission.thread_id_hash}.json`),
        JSON.stringify(otherMission)
      ),
      fsp.writeFile(
        path.join(denialDir, `deny-${sha256('other-run')}.json`),
        JSON.stringify(otherRun)
      )
    ]);

    assert.deepEqual(await run(root, artifactDir), []);
  } finally {
    await fsp.rm(base, { recursive: true, force: true });
  }
});

test('admission, emergency denial, and shared blocker reads never hydrate retention gzip sidecars', async (t) => {
  await t.test('admission', async () => {
    const { base, root, artifactDir } = await fixture('sks-guard-gzip-admission-');
    try {
      const record = admission(1);
      const guardDir = path.join(artifactDir, 'subagent-skill-availability');
      await fsp.mkdir(guardDir, { recursive: true });
      await writeRetentionStub(path.join(guardDir, `thread-${record.thread_id_hash}.json`), record);
      const blockers = await run(root, artifactDir);
      assert.ok(blockers.includes('subagent_skill_availability_guard_invalid'));
      assert.equal(blockers.includes(blockerCode), false);
    } finally {
      await fsp.rm(base, { recursive: true, force: true });
    }
  });

  await t.test('emergency denial', async () => {
    const { base, root, artifactDir } = await fixture('sks-guard-gzip-denial-');
    try {
      const record = denial(2);
      const denialDir = path.join(artifactDir, 'subagent-skill-availability-emergency-denials');
      await fsp.mkdir(denialDir, { recursive: true });
      await writeRetentionStub(path.join(denialDir, `deny-${sha256('denial-2')}.json`), record);
      const blockers = await run(root, artifactDir);
      assert.ok(blockers.includes('subagent_skill_availability_guard_invalid'));
      assert.equal(blockers.includes(blockerCode), false);
    } finally {
      await fsp.rm(base, { recursive: true, force: true });
    }
  });

  await t.test('shared blocker', async () => {
    const { base, root, artifactDir } = await fixture('sks-guard-gzip-shared-');
    try {
      await writeRetentionStub(
        path.join(artifactDir, SUBAGENT_SKILL_AVAILABILITY_BLOCKER_FILENAME),
        denial(3)
      );
      const blockers = await run(root, artifactDir);
      assert.ok(blockers.includes('subagent_skill_availability_blocker_artifact_invalid'));
      assert.equal(blockers.includes(blockerCode), false);
    } finally {
      await fsp.rm(base, { recursive: true, force: true });
    }
  });
});

test('oversized, non-regular, and symlink lifecycle records fail closed', async (t) => {
  const cases = ['oversized', 'non-regular', 'symlink'] as const;
  for (const recordType of ['admission', 'denial', 'shared'] as const) {
    for (const unsafeKind of cases) {
      await t.test(`${recordType} ${unsafeKind}`, async () => {
        const { base, root, artifactDir } = await fixture(`sks-guard-${recordType}-${unsafeKind}-`);
        try {
          const outside = path.join(base, 'outside.json');
          const outsideText = JSON.stringify(recordType === 'admission' ? admission(4) : denial(4));
          await fsp.writeFile(outside, outsideText);
          const file = recordType === 'admission'
            ? path.join(artifactDir, 'subagent-skill-availability', `thread-${sha256('unsafe')}.json`)
            : recordType === 'denial'
              ? path.join(artifactDir, 'subagent-skill-availability-emergency-denials', `deny-${sha256('unsafe')}.json`)
              : path.join(artifactDir, SUBAGENT_SKILL_AVAILABILITY_BLOCKER_FILENAME);
          await fsp.mkdir(path.dirname(file), { recursive: true });
          if (unsafeKind === 'oversized') await fsp.writeFile(file, 'x'.repeat((64 * 1024) + 1));
          else if (unsafeKind === 'non-regular') await fsp.mkdir(file);
          else await fsp.symlink(outside, file);

          const blockers = await run(root, artifactDir);
          const expected = recordType === 'shared'
            ? 'subagent_skill_availability_blocker_artifact_invalid'
            : 'subagent_skill_availability_guard_invalid';
          assert.ok(blockers.includes(expected), JSON.stringify(blockers));
          if (unsafeKind === 'symlink') assert.equal(await fsp.readFile(outside, 'utf8'), outsideText);
        } finally {
          await fsp.rm(base, { recursive: true, force: true });
        }
      });
    }
  }
});
