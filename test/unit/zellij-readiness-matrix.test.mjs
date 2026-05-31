import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDoctorReadinessMatrix } from '../../dist/core/doctor/doctor-readiness-matrix.js';
import { ZELLIJ_LANE_SECTIONS, ZELLIJ_SCREEN_SCRAPEABLE_SECTIONS } from '../../dist/core/zellij/zellij-lane-renderer.js';

const baseConfig = {
  ok: true,
  checks: [
    { name: 'node_process_read', ok: true },
    { name: 'spawned_child_read', ok: true },
    { name: 'actual_codex_cli_config_load', ok: true, status: 'passed' }
  ],
  blockers: []
};

test('zellij missing keeps cli_ready true but mad_ready false', () => {
  const m = buildDoctorReadinessMatrix({
    codex: { bin: '/usr/bin/codex', available: true },
    codex_config: baseConfig,
    zellij: { status: 'missing', ok: false }
  });
  assert.equal(m.cli_ready, true);
  assert.equal(m.mad_ready, false);
  assert.equal(m.tmux_removed_runtime, true);
});

test('zellij ok with readable config makes mad_ready true', () => {
  const m = buildDoctorReadinessMatrix({
    codex: { bin: '/usr/bin/codex', available: true },
    codex_config: baseConfig,
    zellij: { status: 'ok', ok: true, version: '0.44.0', bin: 'zellij', min_version: '0.41.0' }
  });
  assert.equal(m.mad_ready, true);
});

test('screen-scrapeable sections are a strict subset of the composed lane sections', () => {
  const superset = new Set(ZELLIJ_LANE_SECTIONS);
  for (const s of ZELLIJ_SCREEN_SCRAPEABLE_SECTIONS) assert.ok(superset.has(s), `lane sections missing scrapeable section: ${s}`);
  assert.ok(ZELLIJ_SCREEN_SCRAPEABLE_SECTIONS.length < ZELLIJ_LANE_SECTIONS.length);
});
