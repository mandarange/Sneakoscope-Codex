import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMcpToolForConcurrency, compactMcpToolSchema, detectMcp0134PolicyFromConfig } from '../../dist/core/mcp/mcp-0-134-policy.js';

test('MCP 0.134 policy treats readOnlyHint as advisory and preserves refs during compaction', () => {
  const safe = classifyMcpToolForConcurrency({ name: 'docs_search', annotations: { readOnlyHint: true }, inputSchema: { type: 'object' } });
  const destructive = classifyMcpToolForConcurrency({ name: 'docs_delete', annotations: { readOnlyHint: true }, inputSchema: { type: 'object' } });
  const camelCase = classifyMcpToolForConcurrency({ name: 'writeFile', annotations: { readOnlyHint: true }, inputSchema: { type: 'object' } });
  const namespaced = classifyMcpToolForConcurrency({ name: 'filesystem.writeFile', annotations: { readOnlyHint: true }, inputSchema: { type: 'object' } });
  const compacted = compactMcpToolSchema({ type: 'object', properties: { item: { $ref: '#/$defs/Item' } }, $defs: { Item: { type: 'string' } }, description: 'x'.repeat(5000) }, 256);
  const compactedDefinitions = compactMcpToolSchema({ type: 'object', properties: { item: { $ref: '#/definitions/Item' } }, definitions: { Item: { type: 'string' } }, description: 'x'.repeat(5000) }, 256);
  assert.equal(safe.concurrency, 'candidate_parallel_readonly');
  assert.equal(destructive.concurrency, 'serial_required');
  assert.equal(camelCase.concurrency, 'serial_required');
  assert.equal(namespaced.concurrency, 'serial_required');
  assert.equal(compacted.preserved_ref_defs, true);
  assert.equal(compactedDefinitions.schema.definitions.Item.type, 'string');
});

test('MCP 0.134 config detector records server env and OAuth', () => {
  const report = detectMcp0134PolicyFromConfig([{ path: 'fixture', text: '{"mcp_servers":{"docs":{"transport":"streamable_http","env":{"TOKEN":"x"},"oauth":{}}}}' }]);
  assert.equal(report.per_server_environment_supported, true);
  assert.equal(report.streamable_http_oauth_supported, false);
  assert.deepEqual(report.streamable_http_servers_detected, ['docs']);
});

test('MCP 0.134 config detector supports nested TOML server env tables', () => {
  const report = detectMcp0134PolicyFromConfig([{
    path: 'config.toml',
    text: '[mcp_servers.docs]\ntransport = "streamable_http"\n[mcp_servers.docs.env]\nDOCS_TOKEN = "x"\n[mcp_servers.docs.oauth]\nclient_id = "fixture"\n'
  }]);
  assert.equal(report.per_server_environment_supported, true);
  assert.equal(report.streamable_http_oauth_supported, true);
  assert.deepEqual(report.servers[0].environment_keys, ['DOCS_TOKEN']);
});
