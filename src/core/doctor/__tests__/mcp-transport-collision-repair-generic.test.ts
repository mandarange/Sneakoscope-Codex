import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { detectAndRepairMcpTransportCollisions } from '../mcp-transport-collision-repair.js';

const STDIO_BLOCK = (name: string) => [
  `[mcp_servers.${name}]`,
  'command = "npx"',
  `args = ["-y", "@example/mcp-server-${name}@latest"]`,
  '',
  `[mcp_servers.${name}.env]`,
  'EXAMPLE_TOKEN = "secret_value"',
  ''
].join('\n');

const URL_BLOCK = (name: string) => `[mcp_servers.${name}]\nurl = "https://mcp.example.com/${name}"\n`;

const DISABLED_BLOCK = (name: string) => `[mcp_servers.${name}]\ndisabled = true\ncommand = "npx"\n`;

async function scenario(projectText: string, globalText: string): Promise<{ root: string; codexHome: string; projectConfig: string; restore: () => void }> {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-mcp-transport-collision-'));
  const root = path.join(temp, 'project');
  const codexHome = path.join(temp, 'codex-home');
  await fs.mkdir(path.join(root, '.codex'), { recursive: true });
  await fs.mkdir(codexHome, { recursive: true });
  const projectConfig = path.join(root, '.codex', 'config.toml');
  await fs.writeFile(projectConfig, projectText);
  await fs.writeFile(path.join(codexHome, 'config.toml'), globalText);
  const savedHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = codexHome;
  return {
    root,
    codexHome,
    projectConfig,
    restore: () => {
      if (savedHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = savedHome;
    }
  };
}

test('detectAndRepairMcpTransportCollisions detects and fixes an arbitrary server name (project stdio vs global url)', async () => {
  const s = await scenario(STDIO_BLOCK('x-custom'), URL_BLOCK('x-custom'));
  try {
    const before = await detectAndRepairMcpTransportCollisions({ root: s.root, apply: false, reportPath: null });
    const entryBefore = before.servers.find((e) => e.server === 'x-custom');
    assert.ok(entryBefore);
    assert.equal(entryBefore?.status, 'collision_detected');
    assert.equal(entryBefore?.project_transport, 'stdio');
    assert.equal(entryBefore?.global_transport, 'url');
    assert.equal(before.ok, false);
    assert.ok(before.blockers.includes('mcp_transport_collision:x-custom'));
    assert.match(await fs.readFile(s.projectConfig, 'utf8'), /^\[mcp_servers\.x-custom\]/m);

    const after = await detectAndRepairMcpTransportCollisions({ root: s.root, apply: true, reportPath: null });
    const entryAfter = after.servers.find((e) => e.server === 'x-custom');
    assert.equal(entryAfter?.status, 'collision_resolved');
    assert.equal(after.ok, true);
    assert.ok(after.warnings.includes('mcp_transport_collision_resolved:x-custom'));
    const afterText = await fs.readFile(s.projectConfig, 'utf8');
    assert.doesNotMatch(afterText, /^\[mcp_servers\.x-custom\]/m);
    assert.match(afterText, /# \[mcp_servers\.x-custom\]/);
    assert.match(afterText, /# EXAMPLE_TOKEN = "secret_value"/);
    assert.equal(after.raw_secret_values_recorded, false);
  } finally {
    s.restore();
  }
});

test('detectAndRepairMcpTransportCollisions detects and fixes the reverse direction (project url vs global stdio)', async () => {
  const s = await scenario(URL_BLOCK('y-reverse'), STDIO_BLOCK('y-reverse'));
  try {
    const before = await detectAndRepairMcpTransportCollisions({ root: s.root, apply: false, reportPath: null });
    const entryBefore = before.servers.find((e) => e.server === 'y-reverse');
    assert.equal(entryBefore?.status, 'collision_detected');
    assert.equal(entryBefore?.project_transport, 'url');
    assert.equal(entryBefore?.global_transport, 'stdio');
    assert.ok(before.blockers.includes('mcp_transport_collision:y-reverse'));

    const after = await detectAndRepairMcpTransportCollisions({ root: s.root, apply: true, reportPath: null });
    const entryAfter = after.servers.find((e) => e.server === 'y-reverse');
    assert.equal(entryAfter?.status, 'collision_resolved');
    assert.equal(after.ok, true);
    const afterText = await fs.readFile(s.projectConfig, 'utf8');
    assert.doesNotMatch(afterText, /^\[mcp_servers\.y-reverse\]/m);
    assert.match(afterText, /# \[mcp_servers\.y-reverse\]/);
    assert.match(afterText, /# url = "https:\/\/mcp\.example\.com\/y-reverse"/);
  } finally {
    s.restore();
  }
});

test('detectAndRepairMcpTransportCollisions does not flag a server with matching transports on both sides', async () => {
  const s = await scenario(URL_BLOCK('z-matching'), URL_BLOCK('z-matching'));
  try {
    const report = await detectAndRepairMcpTransportCollisions({ root: s.root, apply: true, reportPath: null });
    const entry = report.servers.find((e) => e.server === 'z-matching');
    assert.equal(entry?.status, 'no_collision');
    assert.equal(entry?.project_transport, 'url');
    assert.equal(entry?.global_transport, 'url');
    assert.equal(report.ok, true);
    assert.equal(report.blockers.length, 0);
    assert.match(await fs.readFile(s.projectConfig, 'utf8'), /^\[mcp_servers\.z-matching\]/m);
  } finally {
    s.restore();
  }
});

test('detectAndRepairMcpTransportCollisions skips a server explicitly disabled in the project config', async () => {
  const s = await scenario(DISABLED_BLOCK('w-disabled'), URL_BLOCK('w-disabled'));
  try {
    const report = await detectAndRepairMcpTransportCollisions({ root: s.root, apply: true, reportPath: null });
    const entry = report.servers.find((e) => e.server === 'w-disabled');
    assert.equal(entry?.status, 'disabled');
    assert.equal(entry?.project_transport, null);
    assert.equal(entry?.global_transport, null);
    assert.equal(report.ok, true);
    assert.equal(report.blockers.length, 0);
    assert.match(await fs.readFile(s.projectConfig, 'utf8'), /^\[mcp_servers\.w-disabled\]/m);
  } finally {
    s.restore();
  }
});

test('detectAndRepairMcpTransportCollisions reports multiple servers checked in a single project config', async () => {
  const projectText = [STDIO_BLOCK('multi-a'), URL_BLOCK('multi-b')].join('\n');
  const globalText = [URL_BLOCK('multi-a'), URL_BLOCK('multi-b')].join('\n');
  const s = await scenario(projectText, globalText);
  try {
    const report = await detectAndRepairMcpTransportCollisions({ root: s.root, apply: false, reportPath: null });
    const a = report.servers.find((e) => e.server === 'multi-a');
    const b = report.servers.find((e) => e.server === 'multi-b');
    assert.equal(a?.status, 'collision_detected');
    assert.equal(b?.status, 'no_collision');
    assert.equal(report.servers.length, 2);
  } finally {
    s.restore();
  }
});
