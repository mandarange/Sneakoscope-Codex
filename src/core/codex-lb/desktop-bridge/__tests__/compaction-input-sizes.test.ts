import assert from 'node:assert/strict';
import test from 'node:test';
import { compactionInputSizes } from '../compaction-input-sizes.js';
import { createDesktopBridgeRejectionLogger, desktopBridgeRequestShape } from '../rejection-log.js';

test('compact size diagnostics account for Python ASCII escaping, separators and UTF-16 surrogate pairs', () => {
  // Reference lengths measured with Python json.dumps(ensure_ascii=True,
  // sort_keys=True), the estimator in Codex-LB requests.py at 72630bbf.
  for (const [content, expected] of [['abc', 60], ['한😀\n"\\\x7f', 87]] as const) {
    const payload = { input: [{ type: 'message', role: 'developer', content }] };
    const before = JSON.stringify(payload);
    const result = compactionInputSizes(payload)!;
    assert.equal(result.input_ascii_json_chars_estimate, expected);
    assert.equal(result.input_estimated_tokens, Math.ceil(expected / 4));
    assert.equal(result.input_json_bytes, Buffer.byteLength(JSON.stringify(payload.input)));
    assert.equal(result.groups.developer_message?.largest_item_ascii_json_chars_estimate, expected - 2);
    assert.equal(JSON.stringify(payload), before, 'measurement must not change a state anchor');
  }
  assert.equal(compactionInputSizes({ input: [] })?.input_ascii_json_chars_estimate, 2);
});

test('compact diagnostics distinguish the 100,000-estimated-token reference boundary without enforcing it', () => {
  for (const extra of [0, 1]) {
    const payload = { input: [{ type: 'message', role: 'developer', content: 'x'.repeat(400_000 - 57 + extra) }] };
    const before = JSON.stringify(payload);
    const result = compactionInputSizes(payload)!;
    assert.equal(result.input_ascii_json_chars_estimate, 400_000 + extra);
    assert.equal(result.input_estimated_tokens, 100_000 + extra);
    assert.equal(JSON.stringify(payload), before);
  }
});

test('a Lite tool prelude and Korean developer anchor can exceed the reference estimate despite smaller UTF-8 JSON', () => {
  const payload = { input: [
    { type: 'additional_tools', tools: [{ type: 'function', name: 'f', parameters: { type: 'object', properties: { 한: { type: 'string' } } } }] },
    { type: 'message', role: 'developer', content: '한'.repeat(66_650) },
    { type: 'compaction_trigger' }
  ] };
  const result = compactionInputSizes(payload)!;
  assert.equal(result.input_ascii_json_chars_estimate, 400_145);
  assert.equal(result.input_estimated_tokens, 100_037);
  assert.ok(result.input_json_bytes < 400_000);
  assert.equal(result.groups.additional_tools?.items, 1);
  assert.equal(result.groups.developer_message?.items, 1);
  assert.equal(result.groups.compaction_trigger?.items, 1);
});

test('compact diagnostics log only fixed groups and numbers and stay off ordinary request shapes', () => {
  const secret = 'private-user-state';
  const payload = { instructions: secret, input: [
    { type: 'function_call', name: 'update_plan', call_id: secret, arguments: secret },
    { type: 'function_call_output', call_id: secret, output: secret },
    { type: 'reasoning', encrypted_content: secret },
    { type: secret, role: secret, content: secret }
  ] };
  const shape = desktopBridgeRequestShape(payload, true)!;
  assert.equal(shape.compaction_sizes?.groups.state_tool_call?.items, 1);
  assert.equal(shape.compaction_sizes?.groups.function_call_output?.items, 1);
  assert.equal(shape.compaction_sizes?.groups.reasoning?.items, 1);
  assert.equal(shape.compaction_sizes?.groups.other?.items, 1);
  assert.equal(desktopBridgeRequestShape(payload)?.compaction_sizes, undefined);
  const lines: string[] = [];
  const log = createDesktopBridgeRejectionLogger({ write: line => { lines.push(line); } });
  const injected = JSON.parse(JSON.stringify(shape));
  injected.compaction_sizes.message = secret;
  injected.compaction_sizes.groups[secret] = { items: 1, message: secret };
  injected.compaction_sizes.groups.reasoning.message = secret;
  // Existing item-type labels are independently sanitized by the shape logger.
  injected.input_types = {};
  log({ code: 'bridge_upstream_request_rejected', transport: 'http', request_shape: injected });
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.includes(secret), false);
  const logged = JSON.parse(lines[0]!).request_shape.compaction_sizes;
  assert.deepEqual(logged, compactionInputSizes(payload));
  injected.compaction_sizes.input_estimated_tokens = -1;
  log({ code: 'bridge_upstream_request_rejected', transport: 'http', request_shape: injected });
  assert.equal(JSON.parse(lines[1]!).request_shape.compaction_sizes, undefined);
});
