import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('UX-Review command fixture writes mock-safe artifacts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-ux-review-packed-'));
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(root, '.sneakoscope', 'state'), { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(root, '.sneakoscope', 'state', 'current.json'), '{"mode":"IDLE","phase":"IDLE"}\n');
  try {
    const result = spawnSync(process.execPath, [path.resolve('dist/bin/sks.js'), 'image-ux-review', 'fixture', '--mock', '--json'], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: home,
        CODEX_HOME: path.join(home, '.codex'),
        SKS_SKIP_NPM_FRESHNESS_CHECK: '1',
        SKS_UPDATE_MIGRATION_GATE_DISABLED: '1',
        CI: 'true'
      },
      timeout: 180_000
    });
    assert.equal(result.status, 1, result.stderr || result.stdout);
    const json = JSON.parse(result.stdout);
    assert.equal(json.ok, false);
    assert.equal(json.artifacts.gate.mock_fixture_cannot_claim_real, true);
    assert.ok(json.artifacts.gate.blockers.includes('image_ux_fixture_mode_cannot_claim_real'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
