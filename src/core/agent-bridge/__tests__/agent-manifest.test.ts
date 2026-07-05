import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS } from '../../../cli/command-registry.js';
import { buildAgentManifest } from '../agent-manifest.js';

test('agent manifest is non-empty and schema-tagged', () => {
  const manifest = buildAgentManifest();
  assert.equal(manifest.schema, 'sks.agent-manifest.v1');
  assert.equal(typeof manifest.generated_at, 'string');
  assert.ok(manifest.tools.length > 0);
});

test('agent manifest includes well-known confirmed-existing commands', () => {
  const manifest = buildAgentManifest();
  const names = manifest.tools.map((tool) => tool.name);
  for (const expected of ['status', 'doctor']) {
    assert.ok(expected in COMMANDS, `fixture assumption invalid: ${expected} missing from COMMANDS`);
    assert.ok(names.includes(expected), `manifest missing expected command ${expected}`);
  }
});

test('every registry-marked read-only command appears in the manifest as read_only true', () => {
  const manifest = buildAgentManifest();
  const byName = new Map(manifest.tools.map((tool) => [tool.name, tool]));
  const readOnlyNames = Object.entries(COMMANDS)
    .filter(([, command]) => (command as { readonly?: boolean }).readonly === true)
    .map(([name]) => name);

  assert.ok(readOnlyNames.length > 0, 'fixture assumption invalid: no read-only commands found in registry');
  for (const name of readOnlyNames) {
    const tool = byName.get(name);
    assert.ok(tool, `manifest missing registry read-only command ${name}`);
    assert.equal(tool?.read_only, true, `expected ${name} to be read_only in manifest`);
  }
});

test('a clearly destructive-sounding command requires explicit opt-in', () => {
  const manifest = buildAgentManifest();
  const destructiveCandidate = manifest.tools.find((tool) => tool.name.includes('uninstall'));
  assert.ok(destructiveCandidate, 'fixture assumption invalid: no uninstall-family command found in registry');
  assert.equal(destructiveCandidate?.requires_explicit_opt_in, true);
});

test('manifest never fabricates a command name absent from the registry', () => {
  const manifest = buildAgentManifest();
  for (const tool of manifest.tools) {
    assert.ok(tool.name in COMMANDS, `manifest contains a name not in COMMANDS: ${tool.name}`);
  }
  assert.equal(manifest.tools.length, Object.keys(COMMANDS).length);
});

test('every manifest entry has a well-formed shape', () => {
  const manifest = buildAgentManifest();
  for (const tool of manifest.tools) {
    assert.equal(typeof tool.name, 'string');
    assert.equal(typeof tool.description, 'string');
    assert.equal(typeof tool.read_only, 'boolean');
    assert.equal(typeof tool.requires_explicit_opt_in, 'boolean');
    assert.equal(typeof tool.json_output_supported, 'boolean');
    assert.ok(['fast', 'normal', 'long'].includes(tool.latency_class));
    assert.ok(tool.example_invocation.startsWith(`sks ${tool.name}`));
  }
});
