import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentManifest } from '../../agent-bridge/agent-manifest.js';
import {
  buildAgentBridgeSetupMetadata,
  inspectAgentBridgeHostCapabilities,
  runAgentBridgeContractSmokes
} from '../agent-bridge-command.js';

test('agent-bridge setup metadata includes compatibility and both manifest/capability digests', () => {
  const manifest = buildAgentManifest();
  const metadata = buildAgentBridgeSetupMetadata(manifest);
  assert.equal(metadata.compatibility, manifest.compatibility);
  assert.equal(metadata.host_capabilities, manifest.host_capabilities);
  assert.equal(metadata.capability_digest, manifest.host_capabilities.capability_digest);
  assert.match(metadata.manifest_digest, /^sha256:[a-f0-9]{64}$/);
  assert.match(metadata.capability_digest, /^sha256:[a-f0-9]{64}$/);
});

test('agent-bridge contract smokes validate status and Naruto help without starting a mission', async () => {
  const manifest = buildAgentManifest();
  const observed: string[][] = [];
  const result = await runAgentBridgeContractSmokes('/fixture/sks.js', manifest, async (_command, args) => {
    observed.push([...args]);
    const commandArgs = args.slice(1);
    const stdout = commandArgs[0] === 'status'
      ? JSON.stringify({ schema: 'sks.status.v1', ok: true })
      : JSON.stringify({
          schema: 'sks.naruto-subagent-workflow.v1',
          ok: true,
          action: 'help',
          workflow: 'official_codex_subagent',
          max_depth: 1,
          commands: ['run', 'status', 'subagents', 'proof', 'help']
        });
    return { code: 0, stdout, stderr: '', stdoutBytes: stdout.length, stderrBytes: 0, truncated: false, timedOut: false };
  });

  assert.equal(result.status.ok, true);
  assert.equal(result.naruto_help.ok, true);
  assert.equal(result.status.starts_mission, false);
  assert.equal(result.naruto_help.starts_mission, false);
  assert.deepEqual(observed, [
    ['/fixture/sks.js', 'status', '--json'],
    ['/fixture/sks.js', 'naruto', 'help', '--json']
  ]);
  assert.ok(observed.every((args) => !args.includes('run')));
});

test('agent-bridge Naruto help smoke fails on extra stdout or manifest action drift', async () => {
  const manifest = buildAgentManifest();
  const result = await runAgentBridgeContractSmokes('/fixture/sks.js', manifest, async (_command, args) => {
    const commandArgs = args.slice(1);
    const stdout = commandArgs[0] === 'status'
      ? '{}'
      : `${JSON.stringify({
          schema: 'sks.naruto-subagent-workflow.v1',
          action: 'help',
          workflow: 'official_codex_subagent',
          max_depth: 1,
          commands: ['run']
        })}\n{"extra":true}`;
    return { code: 0, stdout, stderr: '', stdoutBytes: stdout.length, stderrBytes: 0, truncated: false, timedOut: false };
  });
  assert.equal(result.status.ok, true);
  assert.equal(result.naruto_help.ok, false);
  assert.deepEqual(result.naruto_help.issues, ['stdout_not_clean_json_object']);
});

test('agent-bridge production inventory reports actual project MCP capability states without blocking optional gaps', async () => {
  const available = await inspectAgentBridgeHostCapabilities('/fixture/project', {
    inventory: async () => ({
      schema: 'sks.mcp-inventory.v2',
      ok: true,
      scope: 'project',
      source: 'config_toml_static',
      servers: [{
        schema: 'sks.mcp-server-config.v2',
        name: 'acas-tools',
        scope: 'project',
        enabled: true,
        transport: 'stdio',
        command: '/fixture/acas-tools',
        oauth: { supported: null, authenticated: null },
        startup_timeout_sec: 10,
        tool_timeout_sec: 60,
        source_path: '/fixture/project/.codex/config.toml',
        managed_by: 'user',
        legacy_inline_secret_present: false,
        legacy_env_keys: []
      }],
      server_count: 1,
      enabled_count: 1,
      failed_count: 0,
      blockers: [],
      warnings: []
    }),
    health: async () => ({
      schema: 'sks.mcp-health.v1',
      server: 'acas-tools',
      scope: 'project',
      status: 'healthy',
      protocol_version: '2024-11-05',
      tool_count: 5,
      tool_names: [
        'datasource_schema_context',
        'datasource_query_readonly',
        'spreadsheet_create',
        'spreadsheet_inspect',
        'spreadsheet_update'
      ],
      instructions_present: false,
      latency_ms: 1,
      checked_at: '2026-07-19T00:00:00.000Z',
      public_error: null,
      log_ref: null
    })
  } as any);

  assert.equal(available.ok, true);
  assert.equal(available.health_status, 'healthy');
  assert.equal(
    available.capabilities.find((entry) => entry.id === 'host.spreadsheet.workbook.v1')?.state,
    'available'
  );
  assert.equal(
    available.capabilities.find((entry) => entry.id === 'host.document.render.v1')?.state,
    'not_requested'
  );

  const absent = await inspectAgentBridgeHostCapabilities('/fixture/project', {
    inventory: async () => ({
      schema: 'sks.mcp-inventory.v2',
      ok: true,
      scope: 'project',
      source: 'config_toml_static',
      servers: [],
      server_count: 0,
      enabled_count: 0,
      failed_count: 0,
      blockers: [],
      warnings: []
    })
  } as any);
  assert.equal(absent.ok, true);
  assert.ok(absent.capabilities.every((entry) => entry.state === 'not_requested'));
});
