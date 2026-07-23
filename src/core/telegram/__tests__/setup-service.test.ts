import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readJson, type RunProcessResult } from '../../fsx.js';
import { remoteCodexSessionBindingsPath } from '../../remote/session-binding.js';
import type { RemoteCodexSessionBindingsV1, RemoteMachineRegistryV1, RemoteSessionIndexV1 } from '../../remote/types.js';
import { TelegramBotApiClient } from '../bot-api.js';
import { setupTelegramLocalCoding } from '../setup.js';
import {
  installAndStartTelegramHubService,
  removeTelegramHubService,
  stopTelegramHubService,
  telegramHubLaunchAgentSource,
  telegramHubServicePaths
} from '../service.js';

test('setup verifies /start, stores only a Keychain reference, and registers a lazy local Codex session', async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-telegram-setup-'));
  const globalRoot = path.join(base, 'global');
  const projectRoot = path.join(base, 'project');
  await fsp.mkdir(projectRoot, { recursive: true });
  const canonicalProjectRoot = await fsp.realpath(projectRoot);
  const token = '123456789:ABCDEFGHIJKLMNOPQRSTUVWX';
  const calls: string[] = [];
  const api = new TelegramBotApiClient(token, {
    fetch: async (url) => {
      const method = String(url).split('/').at(-1);
      calls.push(String(method));
      if (method === 'getMe') {
        return new Response(JSON.stringify({ ok: true, result: { id: 99, username: 'sks_fixture_bot' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({
        ok: true,
        result: [{
          update_id: 10,
          message: {
            message_id: 1,
            chat: { id: 123, type: 'private' },
            from: { id: 456 },
            text: '/start'
          }
        }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
    maxRetries: 0
  });
  let keychainInput = '';
  const result = await setupTelegramLocalCoding({
    token,
    projectRoot,
    globalRoot,
    hostname: 'fixture-mac',
    account: 'fixture-user',
    api,
    keychainWriter: async (secret, service, account) => {
      keychainInput = `${secret}:${service}:${account}`;
    }
  });
  assert.deepEqual(calls, ['getMe', 'getUpdates', 'getUpdates']);
  assert.match(keychainInput, /^123456789:ABCDEFGHIJKLMNOPQRSTUVWX:com\.sneakoscope\.telegram\.bot:fixture-user$/);
  assert.equal(result.pairing.chat_id, '123');
  assert.equal(result.pairing.user_id, '456');
  assert.equal(result.codex_thread_id, null);
  assert.equal(result.codex_thread_state, 'pending_first_turn');

  const configText = await fsp.readFile(result.config_path, 'utf8');
  assert.equal(configText.includes(token), false);
  assert.match(configText, /"type": "keychain"/);
  const registry = await readJson<RemoteMachineRegistryV1>(result.machine_registry_path);
  assert.equal(registry.machines[0]?.transport, 'local');
  assert.equal(registry.machines[0]?.ssh_alias, undefined);
  const index = await readJson<RemoteSessionIndexV1>(result.session_index_path);
  assert.equal(index.targets[0]?.project_root, canonicalProjectRoot);
  const bindings = await readJson<RemoteCodexSessionBindingsV1>(remoteCodexSessionBindingsPath(canonicalProjectRoot));
  assert.equal(bindings.bindings[0]?.codex_thread_id, null);
});

test('explicit setup rejects a negative group chat ID before any Telegram or Keychain access', async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-telegram-setup-invalid-pair-'));
  const projectRoot = path.join(base, 'project');
  await fsp.mkdir(projectRoot, { recursive: true });
  let telegramCalls = 0;
  let keychainCalls = 0;
  const api = new TelegramBotApiClient('123456789:ABCDEFGHIJKLMNOPQRSTUVWX', {
    fetch: async () => {
      telegramCalls += 1;
      throw new Error('unexpected_telegram_call');
    },
    maxRetries: 0
  });

  await assert.rejects(setupTelegramLocalCoding({
    token: '123456789:ABCDEFGHIJKLMNOPQRSTUVWX',
    projectRoot,
    pairedChatId: '-1001234567890',
    pairedUserId: '456',
    api,
    keychainWriter: async () => {
      keychainCalls += 1;
    }
  }), /telegram_pairing_ids_must_be_positive_private_ids/);

  assert.equal(telegramCalls, 0);
  assert.equal(keychainCalls, 0);
});

test('explicit setup preserves a valid positive private pairing', async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-telegram-setup-private-pair-'));
  const globalRoot = path.join(base, 'global');
  const projectRoot = path.join(base, 'project');
  await fsp.mkdir(projectRoot, { recursive: true });
  const calls: string[] = [];
  const api = new TelegramBotApiClient('123456789:ABCDEFGHIJKLMNOPQRSTUVWX', {
    fetch: async (url) => {
      calls.push(String(url).split('/').at(-1) ?? '');
      return new Response(JSON.stringify({ ok: true, result: { id: 99, username: 'sks_fixture_bot' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    },
    maxRetries: 0
  });

  const result = await setupTelegramLocalCoding({
    token: '123456789:ABCDEFGHIJKLMNOPQRSTUVWX',
    projectRoot,
    globalRoot,
    pairedChatId: '123',
    pairedUserId: '456',
    hostname: 'fixture-mac',
    account: 'fixture-user',
    api,
    keychainWriter: async () => {}
  });

  assert.deepEqual(calls, ['getMe']);
  assert.deepEqual(result.pairing, { chat_id: '123', user_id: '456', detected: false });
});

test('LaunchAgent contains a fixed local hub command and no credential material', () => {
  const paths = telegramHubServicePaths('/tmp/sks-global', '/Users/example');
  const source = telegramHubLaunchAgentSource({
    nodeBin: '/usr/local/bin/node',
    sksEntry: '/usr/local/lib/node_modules/sneakoscope/dist/bin/sks.js',
    projectRoot: '/Users/example/src/project',
    paths
  });
  assert.match(source, /com\.sneakoscope\.telegram-hub/);
  assert.match(source, /<string>\/usr\/bin\/caffeinate<\/string><string>-i<\/string>/);
  assert.match(source, /<string>telegram<\/string><string>hub<\/string><string>run<\/string>/);
  assert.match(source, /<key>KeepAlive<\/key>/);
  assert.match(source, /<string>\/Users\/example\/src\/project<\/string>/);
  assert.doesNotMatch(source, /bot_token|123456789:|TOKEN=/i);
});

test('LaunchAgent lifecycle bootstraps, verifies running state, and stops through the exact user service', async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-telegram-service-'));
  const projectRoot = path.join(base, 'project');
  const globalRoot = path.join(base, 'global');
  const home = path.join(base, 'home');
  const nodeBin = path.join(base, 'node');
  const sksEntry = path.join(base, 'sks.js');
  await fsp.mkdir(projectRoot, { recursive: true });
  await fsp.writeFile(nodeBin, '');
  await fsp.writeFile(sksEntry, '');
  let loaded = false;
  const calls: string[][] = [];
  const run = async (_command: string, args: readonly string[]): Promise<RunProcessResult> => {
    calls.push([...args]);
    if (args[0] === 'bootstrap' || args[0] === 'kickstart') loaded = true;
    if (args[0] === 'bootout') loaded = false;
    if (args[0] === 'print') {
      return processResult(
        loaded ? 0 : 113,
        loaded ? 'state = running\npid = 4242\nactive count = 1\n' : '',
        loaded ? '' : 'service not found'
      );
    }
    return processResult(0);
  };
  const options = {
    projectRoot,
    globalRoot,
    home,
    nodeBin,
    sksEntry,
    platform: 'darwin' as const,
    uid: 501,
    launchctl: '/bin/launchctl',
    run
  };
  const started = await installAndStartTelegramHubService(options);
  assert.equal(started.running, true);
  assert.equal(started.pid, 4242);
  assert.ok(calls.some((args) => args[0] === 'bootstrap' && args[1] === 'gui/501'));
  assert.ok(calls.some((args) => args[0] === 'kickstart' && args.at(-1) === 'gui/501/com.sneakoscope.telegram-hub'));
  const stopped = await stopTelegramHubService(options);
  assert.equal(stopped.running, false);
  assert.equal(stopped.ok, true);
});

test('LaunchAgent removal unlinks only the exact SKS Telegram hub plist', async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-telegram-remove-'));
  const home = path.join(base, 'home');
  const paths = telegramHubServicePaths(path.join(base, 'global'), home);
  const unrelatedPlist = path.join(path.dirname(paths.launch_agent_path), 'com.example.keep.plist');
  await fsp.mkdir(path.dirname(paths.launch_agent_path), { recursive: true });
  await fsp.writeFile(paths.launch_agent_path, 'managed');
  await fsp.writeFile(unrelatedPlist, 'unrelated');
  const run = async (_command: string, args: readonly string[]): Promise<RunProcessResult> => (
    args[0] === 'print'
      ? processResult(113, '', 'service not found')
      : processResult(0)
  );

  const removed = await removeTelegramHubService({
    projectRoot: path.join(base, 'project'),
    globalRoot: path.join(base, 'global'),
    home,
    platform: 'darwin',
    uid: 501,
    launchctl: '/bin/launchctl',
    run
  });

  await assert.rejects(fsp.access(paths.launch_agent_path));
  assert.equal(await fsp.readFile(unrelatedPlist, 'utf8'), 'unrelated');
  assert.equal(removed.installed, false);
  assert.equal(removed.ok, true);
});

function processResult(code: number, stdout = '', stderr = ''): RunProcessResult {
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
