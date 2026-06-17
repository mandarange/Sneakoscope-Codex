#!/usr/bin/env node
// @ts-nocheck
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const repo = process.cwd();
const fakeCodex = path.join(repo, 'dist', 'scripts', 'fixtures', 'fake-codex-config-loader.js');

function runDoctorFix(fixture, home, extraEnv) {
  return spawnSync(process.execPath, [
    path.join(repo, 'dist', 'bin', 'sks.js'),
    'doctor',
    '--fix',
    '--json',
    '--codex-bin',
    fakeCodex
  ], {
    cwd: fixture,
    env: {
      ...process.env,
      HOME: home,
      CODEX_HOME: path.join(home, '.codex'),
      SKS_DISABLE_UPDATE_CHECK: '1',
      ...extraEnv
    },
    encoding: 'utf8',
    timeout: 180000
  });
}

// Scenario 1: an EPERM config-load failure the repairs cannot fix MUST stay a blocker
// (the re-probe of a genuinely-unreadable config still reports failure — Fix B does not
// paper over real problems).
const epermFixture = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-doctor-fix-eperm-'));
const epermHome = path.join(epermFixture, 'home');
await fs.mkdir(epermHome, { recursive: true });
const epermRun = runDoctorFix(epermFixture, epermHome, { SKS_FAKE_CODEX_CONFIG_EPERM: '1' });
const epermParsed = parseLastJson(epermRun.stdout || '{}');
const epermOk = epermRun.status !== 0
  && epermParsed.ready?.ready === false
  && epermParsed.ready?.blockers?.includes('codex_cli_config_eperm')
  && epermParsed.ready?.next_actions?.length > 0;

// Scenario 2 (regression for the endless `sks doctor --fix` loop): the project config
// seeds Context7 as a LOCAL STDIO server, which the fake loader treats as the Codex 0.140
// stdio/url merge conflict (`url is not supported for stdio`). `sks doctor --fix` migrates
// Context7 to the remote `url` transport; the post-repair re-probe must then observe a
// loadable config and clear `codex_cli_config_toml_parse_error` — instead of reporting the
// stale pre-migration failure that previously trapped users in a rerun loop.
const c7Fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-doctor-fix-c7-'));
const c7Home = path.join(c7Fixture, 'home');
await fs.mkdir(path.join(c7Fixture, '.codex'), { recursive: true });
await fs.mkdir(c7Home, { recursive: true });
await fs.writeFile(
  path.join(c7Fixture, '.codex', 'config.toml'),
  '[mcp_servers.context7]\ncommand = "npx"\nargs = ["-y", "@upstash/context7-mcp@latest"]\n'
);
const c7Run = runDoctorFix(c7Fixture, c7Home, { SKS_FAKE_CODEX_CONFIG_CONTEXT7_STDIO_CONFLICT: '1' });
const c7Parsed = parseLastJson(c7Run.stdout || '{}');
const c7ConfigText = await fs.readFile(path.join(c7Fixture, '.codex', 'config.toml'), 'utf8').catch(() => '');
const c7MigratedToRemote = /\[mcp_servers\.context7\][^[]*url\s*=\s*"https:\/\/mcp\.context7\.com\/mcp"/.test(c7ConfigText)
  && !/^\s*command\s*=/m.test(c7ConfigText.match(/\[mcp_servers\.context7\][^[]*/)?.[0] || '');
const c7BlockerCleared = !((c7Parsed.ready?.blockers || []).includes('codex_cli_config_toml_parse_error'));
const c7ConfigReadable = c7Parsed.ready?.codex_config_readable_by_codex_cli === true;
const context7Ok = c7MigratedToRemote && c7BlockerCleared && c7ConfigReadable;

const ok = epermOk && context7Ok;

console.log(JSON.stringify({
  schema: 'sks.doctor-fix-proves-codex-read-check.v2',
  ok,
  eperm_case: {
    ok: epermOk,
    status: epermRun.status,
    blockers: epermParsed.ready?.blockers || null
  },
  context7_reprobe_case: {
    ok: context7Ok,
    status: c7Run.status,
    migrated_to_remote: c7MigratedToRemote,
    parse_error_cleared: c7BlockerCleared,
    config_readable_by_codex_cli: c7ConfigReadable,
    blockers: c7Parsed.ready?.blockers || null,
    config_tail: c7ConfigText.slice(-400)
  },
  parsed: epermParsed,
  stdout_tail: String(epermRun.stdout || '').slice(-1000),
  stderr_tail: String(epermRun.stderr || '').slice(-1000)
}, null, 2));
if (!ok) process.exitCode = 1;

function parseLastJson(text) {
  const source = String(text || '').trim();
  if (!source) return {};
  const starts = [];
  for (let index = source.indexOf('{'); index >= 0; index = source.indexOf('{', index + 1)) starts.push(index);
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(source.slice(starts[i]));
    } catch {
      // Continue searching for the outer JSON object; pretty JSON may contain nested objects.
    }
  }
  return {};
}
