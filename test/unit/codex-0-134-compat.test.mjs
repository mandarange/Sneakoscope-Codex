import test from 'node:test';
import assert from 'node:assert/strict';
import { codex0134Matrix } from '../../dist/core/codex/codex-0-134-compat.js';

test('Codex 0.134 matrix exposes primary profile, MCP, history, and hook context capabilities', () => {
  const matrix = codex0134Matrix({
    version: 'codex-cli 0.134.0',
    available: true,
    execHelp: '--profile <CONFIG_PROFILE_V2>',
    mcpHelp: 'env oauth streamable',
    historyHelp: 'search conversation history',
    schemaPolicyText: '$ref $defs'
  });
  assert.equal(matrix.baseline, 'rust-v0.134.0');
  assert.equal(matrix.profile_primary_selector, true);
  assert.equal(matrix.local_history_search_supported, true);
  assert.equal(matrix.mcp_0_134_modernization_supported, true);
  assert.equal(matrix.hook_subagent_context_supported, true);
  assert.equal(matrix.ok, true);
});
