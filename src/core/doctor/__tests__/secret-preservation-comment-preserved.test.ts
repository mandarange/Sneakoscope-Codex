import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { withSecretPreservationGuard } from '../../config/secret-preservation.js';
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

async function scenario(): Promise<{ root: string; codexHome: string; projectConfig: string; restore: () => void }> {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-secret-guard-comment-'));
  const root = path.join(temp, 'project');
  const codexHome = path.join(temp, 'codex-home');
  await fs.mkdir(path.join(root, '.codex'), { recursive: true });
  await fs.mkdir(codexHome, { recursive: true });
  const projectConfig = path.join(root, '.codex', 'config.toml');
  await fs.writeFile(projectConfig, STDIO_SUPABASE);
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

// Regression for a real bug: `doctor --fix` wraps its whole run in
// withSecretPreservationGuard('doctor-fix', ...). Commenting out the stdio
// supabase block (the transport-collision repair) makes SUPABASE_ACCESS_TOKEN
// disappear from the guard's *live* scan, even though the value is still
// sitting right there in the comment. Before this fix the guard treated that
// as an accidental secret loss, rolled the whole file back (undoing the
// repair), and still threw — so `doctor --fix` could never actually resolve
// the collision, no matter how many times it ran.
test('withSecretPreservationGuard does not roll back a repair that comments out a block while preserving the secret value in the comment', async () => {
  const s = await scenario();
  try {
    const report = await withSecretPreservationGuard(s.root, 'test-transport-collision-repair', () =>
      repairSupabaseMcp({ root: s.root, apply: true, reportPath: null })
    );
    assert.equal(report.transport_collision_resolved, true);
    assert.equal(report.ok, true);
    const after = await fs.readFile(s.projectConfig, 'utf8');
    // The repair's effect must survive the guard: stdio header commented out,
    // token preserved only as a comment (not restored to a live assignment).
    assert.doesNotMatch(after, /^\[mcp_servers\.supabase\]/m);
    assert.doesNotMatch(after, /^SUPABASE_ACCESS_TOKEN\s*=/m);
    assert.match(after, /# SUPABASE_ACCESS_TOKEN = "sbp_secret_value"/);
  } finally {
    s.restore();
  }
});

// A secret that goes missing with no trace anywhere in the file (no comment,
// no backup reference) must still trip the guard — this is the actual data
// -loss case the guard exists to catch, and the fix above must not weaken it.
test('withSecretPreservationGuard still blocks a protected secret that is deleted with no comment trace', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-secret-guard-delete-'));
  const envFile = path.join(temp, '.env.local');
  await fs.writeFile(envFile, 'NEXT_PUBLIC_SUPABASE_ANON_KEY=guard-secret\n');
  let blocked = false;
  try {
    await withSecretPreservationGuard(temp, 'test-full-delete', async () => {
      await fs.writeFile(envFile, 'UNRELATED=1\n', 'utf8');
    });
  } catch {
    blocked = true;
  }
  assert.equal(blocked, true);
  const restored = await fs.readFile(envFile, 'utf8');
  assert.match(restored, /guard-secret/);
});
