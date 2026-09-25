import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PACKAGE_VERSION } from '../../fsx.js';
import { agentsBlockText } from '../../init.js';
import {
  MANAGED_GUIDANCE_STAMP_SCHEMA,
  managedGuidanceStampPath,
  maybeReconcileManagedGuidancePreflight
} from '../managed-guidance-preflight.js';

const BEGIN = '<!-- BEGIN Sneakoscope Codex GX MANAGED BLOCK -->';
const END = '<!-- END Sneakoscope Codex GX MANAGED BLOCK -->';
// What a 10.3.1 install left behind: the parent implements, children are Astra-only.
const STALE_BLOCK = [
  '# Sneakoscope Codex Managed Rules',
  '- General work stays parent-owned. Use `$sks-naruto` for explicitly requested parallel work or concrete independent slices.',
  '- SKS children must explicitly set model="gpt-6-astra".'
].join('\n');

async function withProject(run: (root: string) => Promise<void>) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-managed-guidance-'));
  try {
    await run(root);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
}

test('a hook-only project refreshes a stale managed AGENTS block once and keeps user text', async () => {
  await withProject(async (root) => {
    await fsp.mkdir(path.join(root, '.sneakoscope'), { recursive: true });
    const agents = path.join(root, 'AGENTS.md');
    await fsp.writeFile(agents, `# My project rules\n\nKeep this line.\n\n${BEGIN}\n${STALE_BLOCK}\n${END}\n`);

    const first = await maybeReconcileManagedGuidancePreflight(root);
    assert.deepEqual(first?.refreshed, ['AGENTS.md']);
    const text = await fsp.readFile(agents, 'utf8');
    assert.match(text, /^# My project rules\n\nKeep this line\./);
    assert.ok(text.includes(agentsBlockText().trim()));
    assert.doesNotMatch(text, /General work stays parent-owned|model="gpt-6-astra"/);
    const stamp = JSON.parse(await fsp.readFile(managedGuidanceStampPath(root), 'utf8'));
    assert.equal(stamp.schema, MANAGED_GUIDANCE_STAMP_SCHEMA);
    assert.equal(stamp.version, PACKAGE_VERSION);

    // The stamp keeps every later hook to one read, even if the file changes.
    await fsp.writeFile(agents, `${BEGIN}\n${STALE_BLOCK}\n${END}\n`);
    assert.equal(await maybeReconcileManagedGuidancePreflight(root), null);
    assert.match(await fsp.readFile(agents, 'utf8'), /General work stays parent-owned/);
  });
});

test('a project marked only by .codex/SNEAKOSCOPE.md is refreshed and queued for its full migration', async () => {
  await withProject(async (root) => {
    await fsp.mkdir(path.join(root, '.codex'), { recursive: true });
    await fsp.writeFile(path.join(root, '.codex', 'SNEAKOSCOPE.md'), '# SKS\n');
    await fsp.writeFile(path.join(root, 'AGENTS.md'), `${BEGIN}\n${STALE_BLOCK}\n${END}\n`);
    const result = await maybeReconcileManagedGuidancePreflight(root);
    assert.deepEqual(result?.refreshed, ['AGENTS.md']);
    // The background runner never starts under node --test.
    assert.equal(result?.migration, 'not_queued:disabled');
  });
});

test('unmarked user guidance and non-SKS directories are never touched', async () => {
  await withProject(async (root) => {
    const agents = path.join(root, 'AGENTS.md');
    const userText = '# Rules\nGeneral work stays parent-owned in this repo.\n';
    await fsp.writeFile(agents, userText);
    assert.equal(await maybeReconcileManagedGuidancePreflight(root), null);
    await assert.rejects(fsp.access(path.join(root, '.sneakoscope')));

    await fsp.mkdir(path.join(root, '.sneakoscope'), { recursive: true });
    const result = await maybeReconcileManagedGuidancePreflight(root);
    assert.deepEqual(result?.refreshed, []);
    assert.equal(await fsp.readFile(agents, 'utf8'), userText);
  });
});
