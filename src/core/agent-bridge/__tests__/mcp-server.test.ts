import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { invokeSksTool, runMcpServer } from '../mcp-server.js';
import { buildAgentManifest } from '../agent-manifest.js';
import { commandContract } from '../../safety/command-contract/index.js';

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: { code: number; message: string };
}

function makeHarness() {
  const clientToServer = new PassThrough();
  const serverToClient = new PassThrough();
  const responses: JsonRpcResponse[] = [];
  let buffer = '';
  serverToClient.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let idx: number;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.trim()) responses.push(JSON.parse(line));
    }
  });
  return { clientToServer, serverToClient, responses };
}

function send(stream: PassThrough, message: Record<string, unknown>): void {
  stream.write(`${JSON.stringify(message)}\n`);
}

async function waitForResponseId(responses: JsonRpcResponse[], id: number, timeoutMs = 20_000): Promise<JsonRpcResponse> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = responses.find((r) => r.id === id);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for JSON-RPC response id ${id}`);
}

test('runMcpServer responds to initialize with well-formed protocol/server info', async () => {
  const { clientToServer, serverToClient, responses } = makeHarness();
  await runMcpServer({ input: clientToServer, output: serverToClient });

  send(clientToServer, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'sks-mcp-test-client', version: '0.0.1' }
    }
  });

  const response = await waitForResponseId(responses, 1);
  assert.equal(response.jsonrpc, '2.0');
  assert.equal(response.id, 1);
  assert.ok(response.result, 'initialize response missing result');
  assert.equal(typeof response.result.protocolVersion, 'string');
  assert.equal(response.result.serverInfo?.name, 'sks-mcp-server');
  assert.equal(typeof response.result.serverInfo?.version, 'string');
  assert.ok(response.result.capabilities, 'initialize response missing capabilities');
  assert.ok('tools' in response.result.capabilities, 'initialize capabilities missing tools key');
});

test('runMcpServer tools/list returns only read-only manifest tools by default', async () => {
  const { clientToServer, serverToClient, responses } = makeHarness();
  await runMcpServer({ input: clientToServer, output: serverToClient });

  send(clientToServer, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'c', version: '0' } } });
  await waitForResponseId(responses, 1);

  send(clientToServer, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  const response = await waitForResponseId(responses, 2);

  assert.equal(response.jsonrpc, '2.0');
  assert.ok(response.result, 'tools/list response missing result');
  assert.ok(Array.isArray(response.result.tools), 'tools/list result.tools must be an array');
  assert.ok(response.result.tools.length > 0, 'tools/list returned no tools');

  const manifest = buildAgentManifest();
  const readOnlyNames = new Set(manifest.tools.filter((t) => t.read_only).map((t) => t.name));
  const nonReadOnlyNames = new Set(manifest.tools.filter((t) => !t.read_only).map((t) => t.name));
  assert.ok(nonReadOnlyNames.size > 0, 'fixture assumption invalid: no non-read-only commands in manifest');

  const listedNames = response.result.tools.map((t: any) => t.name);
  for (const name of listedNames) {
    assert.ok(readOnlyNames.has(name), `tools/list exposed non-read-only tool ${name} without --expose-exec`);
    const descriptor = response.result.tools.find((entry: any) => entry.name === name);
    assert.equal(descriptor.inputSchema.type, 'object');
    assert.equal(descriptor.inputSchema.additionalProperties, false);
  }
  assert.ok(listedNames.includes('status'), 'tools/list missing expected read-only tool "status"');
  for (const name of nonReadOnlyNames) {
    assert.ok(!listedNames.includes(name), `tools/list must not expose non-read-only tool ${name} by default`);
  }
});

test('invokeSksTool validates input, applies argv, and uses latency bounds', async () => {
  const contract = commandContract('stop-gate');
  assert.ok(contract);
  let observedArgs: readonly string[] = [];
  let observedOptions: any = null;
  const result = await invokeSksTool(contract, { route: 'Naruto', json: true }, async (_command, args, options) => {
    observedArgs = args;
    observedOptions = options;
    return { code: 0, stdout: '{}', stderr: '', stdoutBytes: 2, stderrBytes: 0, truncated: false, timedOut: false };
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.argv, ['stop-gate', 'check', '--route', 'Naruto', '--json']);
  assert.ok(observedArgs.includes('stop-gate'));
  assert.equal(observedOptions.timeoutMs, 15_000);
  assert.equal(observedOptions.maxOutputBytes, 128 * 1024);
});

test('invokeSksTool rejects invalid arguments before spawning', async () => {
  const contract = commandContract('status');
  assert.ok(contract);
  let spawned = false;
  await assert.rejects(
    invokeSksTool(contract, { argv: ['--unsafe'] }, async () => {
      spawned = true;
      throw new Error('must not run');
    }),
    /INVALID_ARGUMENTS|Invalid arguments/
  );
  assert.equal(spawned, false);
});

test('Naruto unknown input is rejected before spawn even though execution is local-only', async () => {
  const contract = commandContract('naruto');
  assert.ok(contract);
  let spawned = false;
  await assert.rejects(
    invokeSksTool(contract, { action: 'run', task: 'x', model: 'unsupported' }, async () => {
      spawned = true;
      throw new Error('must not run');
    }),
    /Invalid arguments for naruto/
  );
  assert.equal(spawned, false);
});

test('runMcpServer tools/call on a safe read-only tool spawns sks and returns its stdout', async () => {
  const { clientToServer, serverToClient, responses } = makeHarness();
  await runMcpServer({ input: clientToServer, output: serverToClient });

  send(clientToServer, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'c', version: '0' } } });
  await waitForResponseId(responses, 1);

  send(clientToServer, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'status', arguments: {} } });
  const response = await waitForResponseId(responses, 2, 60_000);

  assert.equal(response.jsonrpc, '2.0');
  assert.ok(response.result, 'tools/call response missing result');
  assert.ok(Array.isArray(response.result.content), 'tools/call result.content must be an array');
  assert.ok(response.result.content.length > 0, 'tools/call returned no content blocks');
  assert.equal(response.result.content[0].type, 'text');
  assert.equal(typeof response.result.content[0].text, 'string');
  assert.equal(response.result.isError, false);
});

test('runMcpServer tools/call rejects a tool name absent from the manifest without spawning a process', async () => {
  const { clientToServer, serverToClient, responses } = makeHarness();
  await runMcpServer({ input: clientToServer, output: serverToClient });

  send(clientToServer, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'c', version: '0' } } });
  await waitForResponseId(responses, 1);

  const bogusName = 'definitely_not_a_real_sks_command_xyz';
  const manifest = buildAgentManifest();
  assert.ok(!manifest.tools.some((t) => t.name === bogusName), 'fixture assumption invalid: bogus tool name collides with a real command');

  send(clientToServer, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: bogusName, arguments: {} } });
  const response = await waitForResponseId(responses, 2);

  assert.equal(response.jsonrpc, '2.0');
  assert.ok(response.result, 'unknown tool call should return a tool-result (isError: true), not hang');
  assert.equal(response.result.isError, true);
  assert.ok(Array.isArray(response.result.content) && response.result.content.length > 0);
  assert.match(response.result.content[0].text, /Unknown or unexposed tool/);
});

test('runMcpServer tools/call rejects a non-read-only tool when --expose-exec is not set', async () => {
  const { clientToServer, serverToClient, responses } = makeHarness();
  await runMcpServer({ input: clientToServer, output: serverToClient });

  const manifest = buildAgentManifest();
  const nonReadOnly = manifest.tools.find((t) => !t.read_only);
  assert.ok(nonReadOnly, 'fixture assumption invalid: no non-read-only commands in manifest');

  send(clientToServer, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'c', version: '0' } } });
  await waitForResponseId(responses, 1);

  send(clientToServer, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: nonReadOnly!.name, arguments: {} } });
  const response = await waitForResponseId(responses, 2);

  assert.ok(response.result, 'non-exposed tool call should return a tool-result (isError: true), not hang');
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /Unknown or unexposed tool/);
});
