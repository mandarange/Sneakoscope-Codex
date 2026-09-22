import '../../__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { COMMANDS } from '../../../cli/command-registry.js';
import { COMMAND_MANIFEST_BY_NAME } from '../../../cli/command-manifest-lite.js';
import { COMMAND_CATALOG } from '../../routes.js';
import { UsageError, parseDecisionArgs, runDecisionCommand, usage } from '../cli.js';

async function tempEnv(t: test.TestContext): Promise<NodeJS.ProcessEnv> {
  const base = await fsp.mkdtemp(path.join(process.env.TMPDIR || '/tmp', 'sks-jev-cli-'));
  t.after(async () => fsp.rm(base, { recursive: true, force: true }));
  return { HOME: path.join(base, 'home'), SKS_HOME: path.join(base, 'sks-home'), PATH: process.env.PATH || '' };
}

function capture<T>(fn: () => Promise<T>): Promise<{ value: T; stdout: string; stderr: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => { out.push(args.map(String).join(' ')); };
  console.error = (...args: unknown[]) => { err.push(args.map(String).join(' ')); };
  return fn().then((value) => ({ value, stdout: out.join('\n'), stderr: err.join('\n') })).finally(() => {
    console.log = originalLog;
    console.error = originalError;
  });
}

test('decision is registered as a labs command with json support and no remote access', () => {
  const manifest = COMMAND_MANIFEST_BY_NAME.decision;
  assert.equal(manifest.maturity, 'labs');
  assert.equal(manifest.remoteAllowed, false);
  assert.equal(manifest.supportsJson, true);
  assert.deepEqual([...COMMANDS.decision.packageRequiredFiles], ['dist/commands/decision.js']);
  assert.ok(COMMAND_CATALOG.some((entry: { name: string }) => entry.name === 'decision'));
  assert.match(usage(), /no advisory mode/);
});

test('argument parsing rejects unknown options and retired local subcommands', async (t) => {
  assert.throws(() => parseDecisionArgs(['status', '--verbose']), UsageError);
  assert.throws(() => parseDecisionArgs(['status', 'extra']), UsageError);
  assert.throws(() => parseDecisionArgs(['install']), UsageError);
  assert.throws(() => parseDecisionArgs(['mode', 'advisory']), UsageError);
  assert.throws(() => parseDecisionArgs(['start']), UsageError);
  const env = await tempEnv(t);
  const help = await capture(() => runDecisionCommand(['--help'], env));
  assert.equal(help.value, 0);
  assert.match(help.stdout, /Usage: sks decision/);
  const badEnable = await capture(() => runDecisionCommand(['enable', '--provider', 'openrouter', '--model', 'typesafe/jev-1.13'], env));
  assert.equal(badEnable.value, 2);
  assert.match(badEnable.stderr, /--consent-cloud/);
});

test('status never calls OpenRouter and leftover local-decision files are ignored', async (t) => {
  const env = await tempEnv(t);
  await fsp.mkdir(path.join(env.SKS_HOME!, 'local-decision'), { recursive: true });
  await fsp.writeFile(path.join(env.SKS_HOME!, 'local-decision', 'config.json'), JSON.stringify({
    schemaVersion: 1,
    mode: 'advisory'
  }));
  const status = await capture(() => runDecisionCommand(['status', '--json'], env));
  assert.equal(status.value, 0);
  const report = JSON.parse(status.stdout);
  assert.equal(report.mode, 'off');
  assert.equal(report.consentCloud, false);
  assert.equal(report.migration, undefined);
  assert.equal(report.recovery.supported, false);
  assert.equal(report.nextStep, 'missing_key');
  await assert.rejects(fsp.access(path.join(env.SKS_HOME!, 'decisions')));
});

test('enable requires the pinned model and cloud consent; disable returns to baseline', async (t) => {
  const env = await tempEnv(t);
  const enabled = await capture(() => runDecisionCommand([
    'enable',
    '--provider', 'openrouter',
    '--model', 'typesafe/jev-1.13',
    '--consent-cloud',
    '--json'
  ], env));
  assert.equal(enabled.value, 0);
  const report = JSON.parse(enabled.stdout);
  assert.equal(report.config.mode, 'jev');
  assert.equal(report.config.consentCloud, true);
  assert.equal(report.config.capabilities.recovery.ready, false);
  const status = await capture(() => runDecisionCommand(['status', '--json'], env));
  assert.equal(status.value, 0);
  const after = JSON.parse(status.stdout);
  assert.equal(after.mode, 'jev');
  assert.equal(after.consentCloud, true);
  assert.equal(after.nextStep, 'missing_key');
  assert.equal(after.utilization.officialSubagentPreparation, true);
  const disabled = await capture(() => runDecisionCommand(['disable', '--json'], env));
  assert.equal(disabled.value, 0);
  assert.equal(JSON.parse(disabled.stdout).config.mode, 'off');
});

test('probe without a key is unavailable and evaluate writes a synthetic report', async (t) => {
  const env = await tempEnv(t);
  const probe = await capture(() => runDecisionCommand(['probe', '--json'], env));
  assert.equal(probe.value, 1);
  assert.equal(JSON.parse(probe.stdout).error, 'missing_key');
  const dataset = path.join(env.SKS_HOME!, '..', 'rows.json');
  const output = path.join(env.SKS_HOME!, '..', 'report.json');
  await fsp.mkdir(path.dirname(dataset), { recursive: true });
  await fsp.writeFile(dataset, JSON.stringify({ rows: [] }));
  const evaluated = await capture(() => runDecisionCommand(['evaluate', '--dataset', dataset, '--output', output, '--json'], env));
  assert.equal(evaluated.value, 0);
  const report = JSON.parse(await fsp.readFile(output, 'utf8'));
  assert.equal(report.live, false);
  assert.ok(report.unavailableReasons.includes('no_labeled_tasks'));
});
