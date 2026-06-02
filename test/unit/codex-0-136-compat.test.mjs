import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CODEX_0_136_BASELINE_TAG,
  CODEX_0_136_VERSION,
  codex0136Matrix
} from '../../dist/core/codex/codex-0-136-compat.js';

test('Codex 0.136 matrix records release-note capabilities from local evidence', () => {
  const matrix = codex0136Matrix({
    available: true,
    version: 'codex-cli 0.136.0',
    doctorText: 'Auth: ChatGPT login token refresh available; relogin required when expired',
    archiveHelp: 'Usage: codex archive [OPTIONS]',
    unarchiveHelp: 'Usage: codex unarchive [OPTIONS]',
    appServerHelp: 'Usage: codex app-server --stdio --status resume thread MCP',
    sandboxSetupHelp: 'Usage: codex sandbox setup --elevated windows requirements',
    remoteControlHelp: 'Usage: codex remote-control register CODEX_API_KEY server token websocket'
  });

  assert.equal(matrix.schema, 'sks.codex-0.136-compat.v1');
  assert.equal(matrix.baseline, CODEX_0_136_BASELINE_TAG);
  assert.equal(matrix.required_version, CODEX_0_136_VERSION);
  assert.equal(matrix.detected_version, '0.136.0');
  assert.equal(matrix.ok, true);
  assert.equal(matrix.session_archive_supported, true);
  assert.equal(matrix.app_server_stdio_supported, true);
  assert.equal(matrix.remote_api_key_registration_supported, true);
  assert.equal(matrix.command_safety_hardening_supported, true);
  assert.equal(matrix.native_image_generation_extension_supported, true);
  assert.equal(matrix.capabilities.some((capability) => capability.id === 'session_archive_restore' && capability.status === 'detected'), true);
  assert.equal(matrix.capabilities.some((capability) => capability.id === 'rmcp_1_7_compat' && capability.status === 'release_baseline'), true);
});

test('Codex 0.136 matrix blocks below-baseline real requirements', () => {
  const matrix = codex0136Matrix({
    available: true,
    version: 'codex-cli 0.135.0',
    requireReal: true
  });

  assert.equal(matrix.ok, false);
  assert.match(matrix.blockers.join('\n'), /codex_0_136_required_but_not_detected/);
});
