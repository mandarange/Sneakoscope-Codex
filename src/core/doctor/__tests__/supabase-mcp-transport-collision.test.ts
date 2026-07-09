import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { repairSupabaseMcp } from '../supabase-mcp-repair.js';

const STDIO_SUPABASE = [
  '[mcp_servers.supabase]',
  'command = "npx"',
  'args = ["-y", "@supabase/mcp-server-supabase@latest"]',
  '',
  '[mcp_servers.supabase.env]',
  'SUPABASE_ACCESS_TOKEN = "sbp_secret_value"',
  ''
].join('\n');

const URL_SUPABASE = '[mcp_servers.supabase]\nurl = "https://mcp.supabase.com/mcp?project_ref=abc"\n';
const MANAGED_MARKER = '# SKS managed test fixture\n';

async function scenario(): Promise<{ root: string; codexHome: string; projectConfig: string; restore: () => void }> {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-supabase-collision-'));
  const root = path.join(temp, 'project');
  const codexHome = path.join(temp, 'codex-home');
  await fs.mkdir(path.join(root, '.codex'), { recursive: true });
  await fs.mkdir(codexHome, { recursive: true });
  const projectConfig = path.join(root, '.codex', 'config.toml');
  await fs.writeFile(projectConfig, `${MANAGED_MARKER}${STDIO_SUPABASE}`);
  await fs.writeFile(path.join(codexHome, 'config.toml'), URL_SUPABASE);
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

test('repairSupabaseMcp flags a project-stdio vs global-url transport collision without --fix', async () => {
  const s = await scenario();
  try {
    const report = await repairSupabaseMcp({ root: s.root, apply: false, reportPath: null });
    assert.equal(report.stdio_url_transport_collision, true);
    assert.equal(report.transport_collision_resolved, false);
    assert.equal(report.ok, false);
    assert.ok(report.blockers.includes('supabase_mcp_stdio_url_transport_collision'));
    // The project config is untouched when not applying.
    assert.match(await fs.readFile(s.projectConfig, 'utf8'), /^\[mcp_servers\.supabase\]/m);
  } finally {
    s.restore();
  }
});

test('repairSupabaseMcp --fix comments out the stdio block so it inherits the global read-only url', async () => {
  const s = await scenario();
  try {
    const report = await repairSupabaseMcp({ root: s.root, apply: true, reportPath: null });
    assert.equal(report.transport_collision_resolved, true);
    assert.equal(report.ok, true);
    assert.ok(report.warnings.includes('supabase_mcp_stdio_block_disabled_for_url_collision'));
    const after = await fs.readFile(s.projectConfig, 'utf8');
    // The active stdio header is gone (commented), so Codex no longer sees a
    // stdio supabase server to merge a url into.
    assert.doesNotMatch(after, /^\[mcp_servers\.supabase\]/m);
    assert.match(after, /# \[mcp_servers\.supabase\]/);
    // The access token is preserved (recoverable) inside the comment, not deleted.
    assert.match(after, /# SUPABASE_ACCESS_TOKEN = "sbp_secret_value"/);
    assert.equal(report.raw_secret_values_recorded, false);
  } finally {
    s.restore();
  }
});

test('repairSupabaseMcp leaves a matching url supabase block alone (no false collision)', async () => {
  const s = await scenario();
  try {
    await fs.writeFile(s.projectConfig, URL_SUPABASE);
    const report = await repairSupabaseMcp({ root: s.root, apply: true, reportPath: null });
    assert.equal(report.stdio_url_transport_collision, false);
    assert.equal(report.transport_collision_resolved, false);
    assert.match(await fs.readFile(s.projectConfig, 'utf8'), /^\[mcp_servers\.supabase\]/m);
  } finally {
    s.restore();
  }
});
