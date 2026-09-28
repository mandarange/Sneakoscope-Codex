// First import: the parity report can spawn the real codex binary, which
// writes $HOME/.codex/tmp lock files when the default home leaks through.
import '../../dist/core/__tests__/helpers/isolated-test-home.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { codexHookOfficialParityReport } from '../../dist/core/codex-hooks/codex-hook-official-parity.js';

function projectWithHook(trusted) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sks-hook-parity-test-')));
  const codexHome = path.join(process.env.HOME, '.codex');
  fs.mkdirSync(path.join(root, '.codex'), { recursive: true });
  fs.mkdirSync(codexHome, { recursive: true });
  fs.writeFileSync(path.join(root, '.codex', 'hooks.json'), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'sks hook stop' }] }] } }));
  fs.writeFileSync(path.join(codexHome, 'config.toml'), trusted ? `[projects."${root}"]\ntrust_level = "trusted"\n` : '');
  return root;
}

const listed = (rows) => async () => ({ schema: 'sks.codex-hooks-list.v1', ok: true, codex_bin: 'fake', data: [{ cwd: '/', hooks: rows, warnings: [], errors: [] }], blocker: null });

test('parity flags a hook SKS expects that Codex does not load', async () => {
  const root = projectWithHook(true);
  const report = await codexHookOfficialParityReport(root, { listHooks: listed([]) });
  assert.equal(report.ok, false);
  assert.ok(report.blockers.includes('codex_does_not_load_expected_hooks'));
});

test('parity passes when Codex reports the same key, hash and trust', async () => {
  const root = projectWithHook(true);
  const first = await codexHookOfficialParityReport(root, { listHooks: listed([]) });
  const entry = first.entries[0];
  const report = await codexHookOfficialParityReport(root, {
    listHooks: listed([{ key: entry.key, eventName: 'stop', currentHash: entry.current_hash_by_sks, trustStatus: 'untrusted', source: 'project', sourcePath: path.join(root, '.codex', 'hooks.json'), enabled: true, isManaged: false, matcher: null }])
  });
  assert.equal(report.ok, true, JSON.stringify(report.blockers));
  assert.equal(report.counts.mismatches, 0);
});

test('an untrusted project contributes no expected hooks', async () => {
  const root = projectWithHook(false);
  const report = await codexHookOfficialParityReport(root, { listHooks: listed([]) });
  assert.equal(report.counts.sks_entries, 0);
  assert.ok(report.warnings.some((warning) => warning.startsWith('project_hooks_not_loaded_untrusted_project:')));
});
