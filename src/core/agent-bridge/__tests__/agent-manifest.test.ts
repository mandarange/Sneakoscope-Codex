import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS } from '../../../cli/command-registry.js';
import { buildAgentManifest, validateAgentManifest } from '../agent-manifest.js';

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

test('an explicitly R3 command requires explicit opt-in without name regex inference', () => {
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
    assert.equal(tool.contract_schema, 'sks.command-contract.v2');
    assert.ok(['R0', 'R1', 'R2', 'R3'].includes(tool.risk));
    assert.equal(typeof tool.remote_allowed, 'boolean');
    assert.equal(typeof tool.telegram_allowed, 'boolean');
    assert.equal(tool.input_schema.type, 'object');
    assert.equal(tool.input_schema.additionalProperties, false);
  }
});

test('generated manifest exactly matches the command registry in sorted order', () => {
  const manifest = buildAgentManifest();
  const validation = validateAgentManifest(manifest);
  assert.equal(validation.ok, true, validation.issues.join(', '));
  assert.deepEqual(validation.observed_names, Object.keys(COMMANDS).sort());
  assert.deepEqual(validation.missing_names, []);
  assert.deepEqual(validation.unexpected_names, []);
  assert.deepEqual(validation.duplicate_names, []);
});

test('Naruto manifest metadata and actions match the parser help contract', () => {
  const manifest = buildAgentManifest();
  const naruto = manifest.tools.find((tool) => tool.name === 'naruto');
  assert.ok(naruto);
  assert.equal(naruto.risk, 'R2');
  assert.equal(naruto.latency_class, 'long');
  assert.equal(naruto.json_output_supported, true);
  assert.equal(naruto.remote_allowed, false);
  assert.equal(naruto.telegram_allowed, false);
  assert.equal(naruto.requires_explicit_opt_in, true);
  assert.equal(naruto.example_invocation, 'sks naruto help --json');
  assert.deepEqual((naruto.input_schema as any).properties.action.enum, ['run', 'status', 'subagents', 'proof', 'help']);
});

test('manifest validation rejects Naruto risk, opt-in, and action drift', () => {
  const manifest: any = buildAgentManifest();
  const naruto = manifest.tools.find((tool: any) => tool.name === 'naruto');
  naruto.risk = 'R1';
  naruto.requires_explicit_opt_in = false;
  naruto.input_schema = {
    ...naruto.input_schema,
    properties: {
      ...naruto.input_schema.properties,
      action: { ...naruto.input_schema.properties.action, enum: ['run', 'status'] }
    }
  };
  const validation = validateAgentManifest(manifest);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.includes('contract_risk_mismatch:naruto'));
  assert.ok(validation.issues.includes('contract_opt_in_mismatch:naruto'));
  assert.ok(validation.issues.includes('naruto_action_contract_mismatch'));
});

test('manifest validation rejects stale removed commands, missing canonical commands, and duplicates', () => {
  const manifest: any = buildAgentManifest();
  const withoutSuperSearch = manifest.tools.filter((tool: any) => tool.name !== 'super-search');
  manifest.tools = [
    { ...withoutSuperSearch[1] },
    { ...withoutSuperSearch[0] },
    ...withoutSuperSearch.slice(2),
    { ...withoutSuperSearch[0] },
    { ...withoutSuperSearch[0], name: 'db', example_invocation: 'sks db --json' }
  ];

  const validation = validateAgentManifest(manifest);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.includes('missing_registry_tool:super-search'));
  assert.ok(validation.issues.includes('unexpected_tool:db'));
  assert.ok(validation.issues.some((issue) => issue.startsWith('duplicate_tool:')));
  assert.ok(validation.issues.includes('tool_order'));
});
