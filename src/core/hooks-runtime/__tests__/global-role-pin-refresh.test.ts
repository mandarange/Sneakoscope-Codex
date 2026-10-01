import '../../__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  managedOfficialSubagentFileContent,
  managedOfficialSubagentRoleBody,
  managedOfficialSubagentRoleByName,
  managedOfficialSubagentRoleContent
} from '../../managed-assets/managed-assets-manifest.js';
import { globalRolePinsStampPath, maybeRefreshGlobalRolePins } from '../global-role-pin-refresh.js';

const role = managedOfficialSubagentRoleByName('implementation_specialist')!;

async function withCodexHome(run: (ctx: { codexHome: string; roleFile: string; writeCache: (slugs: string[]) => Promise<void> }) => Promise<void>) {
  const codexHome = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-global-pins-'));
  const previous = process.env.CODEX_HOME;
  process.env.CODEX_HOME = codexHome;
  const roleFile = path.join(codexHome, 'agents', role.filename);
  try {
    await fsp.mkdir(path.dirname(roleFile), { recursive: true });
    await run({
      codexHome,
      roleFile,
      writeCache: (slugs) => fsp.writeFile(path.join(codexHome, 'models_cache.json'), JSON.stringify({ fetched_at: 'x', models: slugs.map((slug) => ({ slug })) }))
    });
  } finally {
    if (previous === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previous;
    await fsp.rm(globalRolePinsStampPath(), { force: true });
    await fsp.rm(codexHome, { recursive: true, force: true });
  }
}

const pinned = (model: string) => managedOfficialSubagentFileContent(role.id, role.schema_version, managedOfficialSubagentRoleBody({ ...role, model }));

test('a stale Codex-home role file is refreshed from any project, once per change of the newest models', async () => {
  await withCodexHome(async ({ roleFile, writeCache }) => {
    await writeCache(['gpt-6-sol', 'gpt-6.1-sol', 'gpt-6-luna', 'gpt-6-astra']);
    await fsp.writeFile(roleFile, pinned('gpt-6-sol'));
    const first = await maybeRefreshGlobalRolePins();
    assert.equal(first?.stale, 1);
    assert.equal(first?.remaining, 0);
    assert.equal(await fsp.readFile(roleFile, 'utf8'), managedOfficialSubagentRoleContent(role));
    const stamp = JSON.parse(await fsp.readFile(globalRolePinsStampPath(), 'utf8'));
    assert.match(String(stamp.tier_models), /^[0-9a-f]{16}$/);
    assert.equal(await maybeRefreshGlobalRolePins(), null);

    // A newer sol is listed: the same file, pinned to the previous one, is refreshed again.
    await fsp.writeFile(roleFile, pinned('gpt-6-sol'));
    await writeCache(['gpt-6-sol', 'gpt-6.1-sol', 'gpt-6.2-sol', 'gpt-6-luna', 'gpt-6-astra']);
    assert.equal((await maybeRefreshGlobalRolePins())?.stale, 1);
    assert.match(await fsp.readFile(roleFile, 'utf8'), /model = "gpt-6\.2-sol"/);
  });
});

test('without the Codex models cache nothing is judged stale, written, or stamped', async () => {
  await withCodexHome(async ({ roleFile }) => {
    await fsp.writeFile(roleFile, pinned('gpt-5.6-sol'));
    const before = await fsp.readFile(roleFile, 'utf8');
    assert.equal(await maybeRefreshGlobalRolePins(), null);
    assert.equal(await fsp.readFile(roleFile, 'utf8'), before);
    await assert.rejects(fsp.access(globalRolePinsStampPath()));
  });
});

test('a user-edited role file is left alone and the stamp records nothing stale to fix', async () => {
  await withCodexHome(async ({ roleFile, writeCache }) => {
    await writeCache(['gpt-6.1-sol', 'gpt-6-luna', 'gpt-6-astra']);
    const mine = 'name = "implementation_specialist"\nmodel = "gpt-5.6-sol"\ndeveloper_instructions = """mine"""\n';
    await fsp.writeFile(roleFile, mine);
    const result = await maybeRefreshGlobalRolePins();
    assert.deepEqual(result, { stale: 0, updated: [], remaining: 0 });
    assert.equal(await fsp.readFile(roleFile, 'utf8'), mine);
  });
});
