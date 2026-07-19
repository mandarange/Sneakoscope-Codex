import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { packageRoot } from '../../fsx.js';
import {
  CODEX_CLI_UPDATE_STATUS_SCHEMA,
  codexCliUpdateConsoleLines,
  compareCodexCliVersions,
  inspectCodexCliUpdate,
  resolveOperatorCodexCli,
  updateCodexCliNow,
  type CodexCliUpdateStatus
} from '../codex-cli-update.js';

test('Codex CLI update status reports the operator PATH source/current/latest versions and reuses its cache', async () => {
  const fixture = await operatorFixture('sks-codex-cli-update-status-');
  let registryCalls = 0;
  try {
    const deps = {
      whichImpl: async (command: string) => command === 'npm' ? '/fixture/npm' : null,
      runProcessImpl: async (command: string, args: string[]) => {
        if (command === fixture.codex && args[0] === '--version') return processResult(0, 'codex-cli 0.144.1\n');
        registryCalls += 1;
        return processResult(0, '0.145.0\n');
      },
      now: () => new Date('2026-07-12T10:00:00.000Z')
    };
    const first = await inspectCodexCliUpdate({ home: fixture.home, env: fixture.env, deps });
    assert.equal(first.ok, true);
    assert.equal(first.current_version, '0.144.1');
    assert.equal(first.latest_version, '0.145.0');
    assert.equal(first.update_available, true);
    assert.equal(first.source, 'npm');
    assert.equal(first.cli_source, 'path');
    assert.equal(first.cli_path, fixture.codex);
    assert.equal(first.bin, fixture.codex);
    assert.equal(registryCalls, 1);

    const second = await inspectCodexCliUpdate({ home: fixture.home, env: fixture.env, deps });
    assert.equal(second.source, 'cache');
    assert.equal(second.update_available, true);
    assert.equal(second.cli_path, fixture.codex);
    assert.equal(registryCalls, 1);
  } finally {
    await fixture.cleanup();
  }
});

test('Codex CLI update action invokes the official operator codex update command and refreshes status', async () => {
  const fixture = await operatorFixture('sks-codex-cli-update-now-');
  let current = '0.144.1';
  const calls: Array<{ command: string; args: string[] }> = [];
  try {
    const deps = {
      whichImpl: async (command: string) => command === 'npm' ? '/fixture/npm' : null,
      runProcessImpl: async (command: string, args: string[]) => {
        calls.push({ command, args });
        if (command === fixture.codex && args[0] === '--version') return processResult(0, `codex-cli ${current}\n`);
        if (command === fixture.codex && args.join(' ') === 'update --help') {
          return processResult(0, 'Update Codex to the latest version\n\nUsage: codex update [OPTIONS]\n');
        }
        if (command === fixture.codex && args.join(' ') === 'update') {
          current = '0.145.0';
          return processResult(0, 'Codex updated to 0.145.0\n');
        }
        return processResult(0, '0.145.0\n');
      },
      now: () => new Date('2026-07-12T10:05:00.000Z')
    };
    const result = await updateCodexCliNow({ home: fixture.home, env: fixture.env, deps });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.status, 'updated');
    assert.equal(result.before_version, '0.144.1');
    assert.equal(result.after_version, '0.145.0');
    assert.equal(result.cli_source, 'path');
    assert.equal(result.cli_path, fixture.codex);
    assert.equal(result.post_update_cli_path, fixture.codex);
    assert.equal(result.update_method, 'native-self-update');
    assert.equal(result.command, 'codex update');
    assert.equal(result.update_status?.update_available, false);
    assert.equal(calls.some((call) => call.command === fixture.codex && call.args.join(' ') === 'update'), true);
    assert.equal(calls.some((call) => call.command === '/fixture/npm' && call.args.join(' ') === 'view @openai/codex version'), true);
  } finally {
    await fixture.cleanup();
  }
});

test('Codex CLI update keeps its structured result below the menu-bar capture boundary', async () => {
  const fixture = await operatorFixture('sks-codex-cli-update-bounded-output-');
  const secret = 'sk-proj-abcdefghijklmnopqrstuvwxyz123456';
  const noisyOutput = `prefix OPENAI_API_KEY=${secret}\n${'\u0000\u0001\u0002\b\f'.repeat(32 * 1024)}\nuseful tail\n`;
  try {
    const result = await updateCodexCliNow({
      home: fixture.home,
      env: fixture.env,
      deps: {
        runProcessImpl: async (command: string, args: string[]) => {
          if (command === fixture.codex && args[0] === '--version') return processResult(0, 'codex-cli 0.144.1\n');
          if (command === fixture.codex && args.join(' ') === 'update --help') return processResult(0, 'Usage: codex update [OPTIONS]\n');
          if (command === fixture.codex && args.join(' ') === 'update') return processResult(0, noisyOutput);
          return processResult(1, '', `unexpected command: ${command} ${args.join(' ')}`);
        },
        inspectCodexCliUpdateImpl: async () => ({
          schema: CODEX_CLI_UPDATE_STATUS_SCHEMA,
          ok: true,
          status: 'current',
          installed: true,
          bin: fixture.codex,
          cli_path: fixture.codex,
          cli_source: 'path',
          current_version: '0.144.1',
          raw_version: `codex-cli 0.144.1 OPENAI_API_KEY=${secret}`,
          latest_version: '0.144.1',
          update_available: false,
          update_command: 'sks codex update',
          source: 'cache',
          checked_at: '2026-07-19T00:00:00.000Z',
          cache_path: `${path.join(fixture.home, '.sneakoscope', 'cache', 'codex-cli-update.json')}${'x'.repeat(16 * 1024)}`,
          warnings: Array.from({ length: 512 }, (_, index) => `warning-${index}-${'w'.repeat(2048)} OPENAI_API_KEY=${secret}`),
          blockers: Array.from({ length: 512 }, (_, index) => `blocker-${index}-${'b'.repeat(2048)}`),
          guidance: Array.from({ length: 512 }, (_, index) => `guidance-${index}-${'g'.repeat(2048)}`)
        })
      }
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.raw_output_truncated, true);
    assert.match(result.raw_output, /useful tail/);
    const serialized = `${JSON.stringify(result, null, 2)}\n`;
    assert.ok(Buffer.byteLength(serialized, 'utf8') < 64 * 1024);
    assert.doesNotMatch(serialized, new RegExp(secret));
    assert.doesNotMatch(serialized, /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/);
    assert.ok((result.update_status?.warnings.length || 0) <= 12);
  } finally {
    await fixture.cleanup();
  }
});

test('Codex CLI non-JSON update summary never renders raw updater output', () => {
  const result = {
    schema: 'sks.codex-cli-update-result.v1' as const,
    ok: false,
    status: 'failed' as const,
    command: 'codex update',
    update_method: 'native-self-update' as const,
    bin: '/usr/local/bin/codex',
    cli_path: '/usr/local/bin/codex',
    cli_source: 'path' as const,
    post_update_cli_path: '/usr/local/bin/codex',
    post_update_cli_source: 'path' as const,
    before_version: '0.144.5',
    after_version: '0.144.5',
    raw_output: 'RAW_UPDATER_SECRET_SHOULD_NOT_RENDER',
    raw_output_truncated: true,
    update_status: null,
    blockers: ['codex_cli_self_update_failed'],
    guidance: ['Retry from a terminal.']
  };
  const rendered = codexCliUpdateConsoleLines(result).join('\n');
  assert.match(rendered, /Codex CLI update: failed/);
  assert.match(rendered, /codex_cli_self_update_failed/);
  assert.doesNotMatch(rendered, /RAW_UPDATER_SECRET_SHOULD_NOT_RENDER/);
});

test('Codex CLI update falls back to the official standalone installer when native self-update is unavailable', async () => {
  const fixture = await operatorFixture('sks-codex-cli-update-standalone-');
  const codexHome = path.join(fixture.home, '.codex');
  const standaloneBin = path.join(codexHome, 'packages', 'standalone', 'current', 'bin', 'codex');
  let current = '0.144.1';
  const calls: Array<{ command: string; args: string[]; opts?: Record<string, unknown> }> = [];
  try {
    await executableFixture(standaloneBin);
    const deps = {
      whichImpl: async (command: string) => ({ curl: '/fixture/curl', sh: '/fixture/sh', npm: '/fixture/npm' } as Record<string, string>)[command] || null,
      runProcessImpl: async (command: string, args: string[], opts?: Record<string, unknown>) => {
        calls.push({ command, args, ...(opts ? { opts } : {}) });
        if (command === standaloneBin && args[0] === '--version') return processResult(0, `codex-cli ${current}\n`);
        if (command === standaloneBin && args.join(' ') === 'update --help') return processResult(2, '', 'native updater unavailable');
        if (command === '/fixture/curl') return processResult(0, '#!/bin/sh\nCODEX_NON_INTERACTIVE="${CODEX_NON_INTERACTIVE:-false}"\n');
        if (command === '/fixture/sh') {
          current = '0.145.0';
          return processResult(0, 'standalone installer updated Codex\n');
        }
        if (command === '/fixture/npm' && args.join(' ') === 'view @openai/codex version') return processResult(0, '0.145.0\n');
        return processResult(1, '', `unexpected command: ${command} ${args.join(' ')}`);
      }
    };
    const result = await updateCodexCliNow({
      home: fixture.home,
      codexBin: standaloneBin,
      env: { ...fixture.env, CODEX_HOME: codexHome },
      deps
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.update_method, 'standalone-installer');
    assert.match(String(result.command), /chatgpt\.com\/codex\/install\.sh/);
    assert.equal(calls.some((call) => call.command === standaloneBin && call.args.join(' ') === 'update'), false);
    const shellCall = calls.find((call) => call.command === '/fixture/sh');
    assert.ok(shellCall);
    assert.equal((shellCall.opts?.env as NodeJS.ProcessEnv)?.CODEX_NON_INTERACTIVE, '1');
    assert.equal((shellCall.opts?.env as NodeJS.ProcessEnv)?.CODEX_HOME, codexHome);
  } finally {
    await fixture.cleanup();
  }
});

test('Codex CLI update falls back to the matching Homebrew cask and never uses formula semantics', async () => {
  const fixture = await operatorFixture('sks-codex-cli-update-homebrew-cask-');
  const caskRoot = path.join(fixture.home, 'Caskroom', 'codex', '0.144.1');
  const caskBin = path.join(caskRoot, 'codex');
  let current = '0.144.1';
  const calls: Array<{ command: string; args: string[] }> = [];
  try {
    await executableFixture(caskBin);
    const deps = {
      whichImpl: async (command: string) => command === 'brew' ? '/fixture/brew' : command === 'npm' ? '/fixture/npm' : null,
      runProcessImpl: async (command: string, args: string[]) => {
        calls.push({ command, args });
        if (command === caskBin && args[0] === '--version') return processResult(0, `codex-cli ${current}\n`);
        if (command === caskBin && args.join(' ') === 'update --help') return processResult(2, '', 'native updater unavailable');
        if (command === '/fixture/brew' && args.join(' ') === '--prefix --cask codex') return processResult(0, `${caskRoot}\n`);
        if (command === '/fixture/brew' && args.join(' ') === 'upgrade --cask codex') {
          current = '0.145.0';
          return processResult(0, 'upgraded cask codex\n');
        }
        if (command === '/fixture/npm' && args.join(' ') === 'view @openai/codex version') return processResult(0, '0.145.0\n');
        return processResult(1, '', `unexpected command: ${command} ${args.join(' ')}`);
      }
    };
    const result = await updateCodexCliNow({ home: fixture.home, codexBin: caskBin, env: fixture.env, deps });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.update_method, 'homebrew-cask');
    assert.equal(result.command, 'brew upgrade --cask codex');
    assert.equal(calls.some((call) => call.command === caskBin && call.args.join(' ') === 'update'), false);
    assert.equal(calls.some((call) => call.command === '/fixture/brew' && call.args.join(' ') === 'upgrade --cask codex'), true);
    assert.equal(calls.some((call) => call.command === '/fixture/brew' && call.args.join(' ') === 'upgrade codex'), false);
  } finally {
    await fixture.cleanup();
  }
});

test('Codex CLI update falls back to the matching npm global package without invoking native update', async () => {
  const fixture = await operatorFixture('sks-codex-cli-update-npm-global-');
  const npmPrefix = path.join(fixture.home, 'npm-global');
  const npmRoot = path.join(npmPrefix, 'lib', 'node_modules');
  const npmCodex = path.join(npmRoot, '@openai', 'codex', 'bin', 'codex.js');
  let current = '0.144.1';
  const calls: Array<{ command: string; args: string[] }> = [];
  try {
    await executableFixture(npmCodex);
    const deps = {
      whichImpl: async (command: string) => command === 'npm' ? '/fixture/npm' : null,
      runProcessImpl: async (command: string, args: string[]) => {
        calls.push({ command, args });
        if (command === npmCodex && args[0] === '--version') return processResult(0, `codex-cli ${current}\n`);
        if (command === npmCodex && args.join(' ') === 'update --help') return processResult(2, '', 'native updater unavailable');
        if (command === '/fixture/npm' && args.join(' ') === 'root -g') return processResult(0, `${npmRoot}\n`);
        if (command === '/fixture/npm' && args.join(' ') === 'prefix -g') return processResult(0, `${npmPrefix}\n`);
        if (command === '/fixture/npm' && args.join(' ') === 'install -g @openai/codex@latest') {
          current = '0.145.0';
          return processResult(0, 'updated 1 package\n');
        }
        if (command === '/fixture/npm' && args.join(' ') === 'view @openai/codex version') return processResult(0, '0.145.0\n');
        return processResult(1, '', `unexpected command: ${command} ${args.join(' ')}`);
      }
    };
    const result = await updateCodexCliNow({ home: fixture.home, codexBin: npmCodex, env: fixture.env, deps });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.update_method, 'npm-global');
    assert.equal(result.command, 'npm install -g @openai/codex@latest');
    assert.equal(calls.some((call) => call.command === npmCodex && call.args.join(' ') === 'update'), false);
    assert.equal(calls.some((call) => call.command === '/fixture/npm' && call.args.join(' ') === 'install -g @openai/codex@latest'), true);
  } finally {
    await fixture.cleanup();
  }
});

test('explicit operator Codex override takes precedence over a different PATH installation', async () => {
  const fixture = await operatorFixture('sks-codex-cli-explicit-');
  const explicitDir = path.join(fixture.home, 'explicit-bin');
  const explicit = path.join(explicitDir, process.platform === 'win32' ? 'codex.cmd' : 'codex');
  await fsp.mkdir(explicitDir, { recursive: true });
  await fsp.writeFile(explicit, process.platform === 'win32' ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n', 'utf8');
  await fsp.chmod(explicit, 0o755).catch(() => {});
  try {
    const result = await inspectCodexCliUpdate({
      home: fixture.home,
      codexBin: explicit,
      env: fixture.env,
      deps: {
        whichImpl: async (command: string) => command === 'npm' ? '/fixture/npm' : null,
        runProcessImpl: async (command: string, args: string[]) => {
          if (command === explicit && args[0] === '--version') return processResult(0, 'codex-cli 0.150.0\n');
          if (command === fixture.codex && args[0] === '--version') return processResult(0, 'codex-cli 0.149.0\n');
          return processResult(0, '0.150.0\n');
        }
      }
    });
    assert.equal(result.ok, true);
    assert.equal(result.cli_source, 'explicit');
    assert.equal(result.cli_path, explicit);
    assert.equal(result.current_version, '0.150.0');
  } finally {
    await fixture.cleanup();
  }
});

test('menu status ignores divergent Sneakoscope-bundled Codex and selects the operator PATH CLI', async () => {
  const fixture = await operatorFixture('sks-codex-cli-divergent-');
  const bundled = path.join(packageRoot(), 'node_modules', '.bin', process.platform === 'win32' ? 'codex.cmd' : 'codex');
  try {
    assert.equal(await fsp.stat(bundled).then(() => true, () => false), true, 'fixture requires the package-local Codex dependency');
    const env = {
      ...fixture.env,
      SKS_CODEX_BIN: bundled,
      PATH: `${path.dirname(bundled)}${path.delimiter}${fixture.env.PATH}`
    };
    const result = await inspectCodexCliUpdate({
      home: fixture.home,
      env,
      deps: {
        // A generic adapter result may still point at the bundled SDK runtime;
        // this dependency is deliberately ignored by the update resolver.
        getCodexInfoImpl: async () => ({ bin: bundled, version: 'codex-cli 0.144.1', available: true }),
        whichImpl: async (command: string) => command === 'npm' ? '/fixture/npm' : null,
        runProcessImpl: async (command: string, args: string[]) => {
          if (command === fixture.codex && args[0] === '--version') return processResult(0, 'codex-cli 0.155.0\n');
          if (command === bundled && args[0] === '--version') return processResult(0, 'codex-cli 0.144.1\n');
          return processResult(0, '0.155.0\n');
        }
      }
    });
    assert.equal(result.ok, true);
    assert.equal(result.current_version, '0.155.0');
    assert.equal(result.cli_source, 'path');
    assert.equal(result.cli_path, fixture.codex);
    assert.match(result.warnings.join('\n'), /sneakoscope_bundled_candidate_rejected/);
  } finally {
    await fixture.cleanup();
  }
});

test('operator Codex resolver discovers an NVM global install from a launchd-style minimal PATH', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-codex-cli-nvm-'));
  const codex = path.join(home, '.nvm', 'versions', 'node', 'v24.0.2', 'bin', process.platform === 'win32' ? 'codex.cmd' : 'codex');
  try {
    await fsp.mkdir(path.dirname(codex), { recursive: true });
    await fsp.writeFile(codex, process.platform === 'win32' ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n', 'utf8');
    await fsp.chmod(codex, 0o755).catch(() => {});
    const result = await resolveOperatorCodexCli({
      env: { HOME: home, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
      deps: {
        runProcessImpl: async (command: string, args: string[]) => command === codex && args[0] === '--version'
          ? processResult(0, 'codex-cli 0.144.1\n')
          : processResult(1, '', 'unexpected command')
      }
    });
    assert.equal(result.ok, true);
    assert.equal(result.path, codex);
    assert.equal(result.source, 'path');
  } finally {
    await fsp.rm(home, { recursive: true, force: true });
  }
});

test('operator Codex resolver rejects project-local node_modules binaries', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-codex-cli-project-local-'));
  const codex = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'codex.cmd' : 'codex');
  try {
    await fsp.mkdir(path.dirname(codex), { recursive: true });
    await fsp.writeFile(path.join(root, 'package.json'), '{"name":"fixture","private":true}\n');
    await fsp.writeFile(codex, process.platform === 'win32' ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n', 'utf8');
    await fsp.chmod(codex, 0o755).catch(() => {});
    const result = await resolveOperatorCodexCli({
      env: { HOME: root, PATH: path.dirname(codex) },
      deps: { runProcessImpl: async () => processResult(0, 'codex-cli 0.144.1\n') }
    });
    assert.equal(result.ok, false);
    assert.match(result.warnings.join('\n'), /project_local_candidate_rejected/);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('operator Codex resolver rejects a semver-bearing non-Codex executable', async () => {
  const fixture = await operatorFixture('sks-codex-cli-identity-');
  try {
    const result = await resolveOperatorCodexCli({
      env: fixture.env,
      deps: { runProcessImpl: async () => processResult(0, 'not-codex 7.8.9\n') }
    });
    assert.equal(result.ok, false);
    assert.match(result.warnings.join('\n'), /identity_or_version_unavailable/);
  } finally {
    await fixture.cleanup();
  }
});

test('Codex CLI update fails closed when the present operator CLI disappears after update', async () => {
  const fixture = await operatorFixture('sks-codex-cli-update-disappears-');
  try {
    const result = await updateCodexCliNow({
      home: fixture.home,
      env: fixture.env,
      deps: {
        runProcessImpl: async (command: string, args: string[]) => {
          if (command === fixture.codex && args[0] === '--version') return processResult(0, 'codex-cli 0.144.1\n');
          if (command === fixture.codex && args.join(' ') === 'update --help') return processResult(0, 'Usage: codex update [OPTIONS]\n');
          if (command === fixture.codex && args.join(' ') === 'update') {
            await fsp.rm(fixture.codex, { force: true });
            return processResult(0, 'update completed\n');
          }
          return processResult(1, '', 'unexpected command');
        }
      }
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'failed');
    assert.equal(result.cli_path, fixture.codex);
    assert.equal(result.post_update_cli_path, null);
    assert.match(result.blockers.join('\n'), /codex_cli_post_update_missing/);
  } finally {
    await fixture.cleanup();
  }
});

test('Codex CLI update does not hide a disappeared target by falling through to another PATH installation', async () => {
  const fixture = await operatorFixture('sks-codex-cli-update-target-changed-');
  const fallbackDir = path.join(fixture.home, 'fallback-bin');
  const fallback = path.join(fallbackDir, process.platform === 'win32' ? 'codex.cmd' : 'codex');
  await fsp.mkdir(fallbackDir, { recursive: true });
  await fsp.writeFile(fallback, process.platform === 'win32' ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n', 'utf8');
  await fsp.chmod(fallback, 0o755).catch(() => {});
  try {
    const result = await updateCodexCliNow({
      home: fixture.home,
      env: { ...fixture.env, PATH: `${path.dirname(fixture.codex)}${path.delimiter}${fallbackDir}` },
      deps: {
        runProcessImpl: async (command: string, args: string[]) => {
          if (command === fixture.codex && args[0] === '--version') return processResult(0, 'codex-cli 0.144.1\n');
          if (command === fixture.codex && args.join(' ') === 'update --help') return processResult(0, 'Usage: codex update [OPTIONS]\n');
          if (command === fixture.codex && args.join(' ') === 'update') {
            await fsp.rm(fixture.codex, { force: true });
            return processResult(0, 'update completed\n');
          }
          if (command === fallback && args[0] === '--version') return processResult(0, 'codex-cli 0.143.0\n');
          return processResult(1, '', 'unexpected command');
        }
      }
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'failed');
    assert.equal(result.cli_path, fixture.codex);
    assert.equal(result.post_update_cli_path, fallback);
    assert.match(result.blockers.join('\n'), /codex_cli_post_update_target_changed/);
  } finally {
    await fixture.cleanup();
  }
});

test('Codex CLI update fails closed when refreshed update status is missing or failed', async () => {
  const fixture = await operatorFixture('sks-codex-cli-update-status-missing-');
  try {
    const result = await updateCodexCliNow({
      home: fixture.home,
      env: fixture.env,
      deps: {
        runProcessImpl: async (command: string, args: string[]) => {
          if (command === fixture.codex && args[0] === '--version') return processResult(0, 'codex-cli 0.144.1\n');
          if (command === fixture.codex && args.join(' ') === 'update --help') return processResult(0, 'Usage: codex update [OPTIONS]\n');
          if (command === fixture.codex && args.join(' ') === 'update') return processResult(0, 'already current\n');
          return processResult(1, '', 'unexpected command');
        },
        inspectCodexCliUpdateImpl: async () => missingStatus(fixture)
      }
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'failed');
    assert.match(result.blockers.join('\n'), /codex_cli_post_update_status_untrusted/);
  } finally {
    await fixture.cleanup();
  }
});

test('Codex CLI update fails closed when the post-update version regresses', async () => {
  const fixture = await operatorFixture('sks-codex-cli-update-regressed-');
  let current = '0.145.0';
  try {
    const result = await updateCodexCliNow({
      home: fixture.home,
      env: fixture.env,
      deps: {
        runProcessImpl: async (command: string, args: string[]) => {
          if (command === fixture.codex && args[0] === '--version') return processResult(0, `codex-cli ${current}\n`);
          if (command === fixture.codex && args.join(' ') === 'update --help') return processResult(0, 'Usage: codex update [OPTIONS]\n');
          if (command === fixture.codex && args.join(' ') === 'update') {
            current = '0.144.0';
            return processResult(0, 'update completed\n');
          }
          return processResult(1, '', 'unexpected command');
        }
      }
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'failed');
    assert.equal(result.before_version, '0.145.0');
    assert.equal(result.after_version, '0.144.0');
    assert.ok(result.blockers.includes('codex_cli_post_update_version_regressed'));
  } finally {
    await fixture.cleanup();
  }
});

test('Codex CLI update fails closed when neither native self-update nor an official install method can be verified', async () => {
  const fixture = await operatorFixture('sks-codex-cli-update-capability-');
  let updateRan = false;
  try {
    const result = await updateCodexCliNow({
      home: fixture.home,
      env: fixture.env,
      deps: {
        runProcessImpl: async (command: string, args: string[]) => {
          if (command === fixture.codex && args[0] === '--version') return processResult(0, 'codex-cli 0.144.1\n');
          if (command === fixture.codex && args.join(' ') === 'update --help') return processResult(0, 'unrelated help output\n');
          if (command === fixture.codex && args.join(' ') === 'update') updateRan = true;
          return processResult(0, '');
        }
      }
    });
    assert.equal(result.ok, false);
    assert.equal(result.update_method, 'unknown');
    assert.equal(result.command, null);
    assert.ok(result.blockers.includes('codex_cli_update_method_unverified'));
    assert.equal(updateRan, false);
  } finally {
    await fixture.cleanup();
  }
});

test('Codex CLI update action fails closed when no operator Codex is installed', async () => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-codex-cli-missing-'));
  let ran = false;
  try {
    const result = await updateCodexCliNow({
      home,
      env: { HOME: home, PATH: '' },
      deps: {
        runProcessImpl: async () => {
          ran = true;
          return processResult(0, '');
        }
      }
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'missing');
    assert.equal(result.cli_source, 'unavailable');
    assert.equal(ran, false);
    assert.match(result.guidance.join('\n'), /does not invent a package-manager fallback/i);
  } finally {
    await fsp.rm(home, { recursive: true, force: true });
  }
});

test('Codex CLI version comparison handles prerelease and stable ordering', () => {
  assert.equal(compareCodexCliVersions('0.145.0', '0.144.1') > 0, true);
  assert.equal(compareCodexCliVersions('0.145.0-beta.1', '0.145.0') < 0, true);
  assert.equal(compareCodexCliVersions('codex-cli 0.145.0', '0.145.0'), 0);
});

async function operatorFixture(prefix: string) {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  const binDir = path.join(home, 'bin');
  await fsp.mkdir(binDir, { recursive: true });
  const codex = path.join(binDir, process.platform === 'win32' ? 'codex.cmd' : 'codex');
  await fsp.writeFile(codex, process.platform === 'win32' ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n', 'utf8');
  await fsp.chmod(codex, 0o755).catch(() => {});
  return {
    home,
    codex,
    env: { HOME: home, PATH: binDir },
    cleanup: () => fsp.rm(home, { recursive: true, force: true })
  };
}

async function executableFixture(file: string) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, process.platform === 'win32' ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n', 'utf8');
  await fsp.chmod(file, 0o755).catch(() => {});
}

function missingStatus(fixture: Awaited<ReturnType<typeof operatorFixture>>): CodexCliUpdateStatus {
  return {
    schema: CODEX_CLI_UPDATE_STATUS_SCHEMA,
    ok: false,
    status: 'missing',
    installed: false,
    bin: null,
    cli_path: null,
    cli_source: 'unavailable',
    current_version: null,
    raw_version: null,
    latest_version: null,
    update_available: null,
    update_command: 'sks codex update',
    source: 'unavailable',
    checked_at: '2026-07-12T10:05:00.000Z',
    cache_path: path.join(fixture.home, '.sneakoscope', 'cache', 'codex-cli-update.json'),
    warnings: [],
    blockers: ['codex_cli_missing'],
    guidance: []
  };
}

function processResult(code: number, stdout: string, stderr = '') {
  return {
    code,
    stdout,
    stderr,
    stdoutBytes: Buffer.byteLength(stdout),
    stderrBytes: Buffer.byteLength(stderr),
    truncated: false,
    timedOut: false
  };
}
