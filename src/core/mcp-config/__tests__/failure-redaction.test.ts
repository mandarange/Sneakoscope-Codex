import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { executeMcpConfigCommand } from '../../commands/mcp-config-command.js';
import { CodexMcpCliAdapter, type CodexCliMutationOperation, type CodexMcpCliPort } from '../codex-cli-adapter.js';
import { editMcpServer } from '../mutation.js';
import { redactMcpErrorWithSecrets } from '../redaction.js';

async function fixture(t: test.TestContext) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-mcp-failure-redaction-'));
  const home = path.join(root, 'home');
  const configPath = path.join(home, '.codex', 'config.toml');
  const inlineValue = ['opaque', 'legacy', 'alpha'].join('-');
  const unsupportedKeyValue = ['opaque', 'legacy', 'beta'].join('-');
  await fsp.mkdir(path.dirname(configPath), { recursive: true });
  await fsp.writeFile(configPath, [
    '[mcp_servers.docs]',
    'command = "node"',
    `env = { FOO = ${JSON.stringify(inlineValue)} }`,
    '',
    '[mcp_servers.other]',
    'command = "node"',
    `env = { "BAD-NAME" = ${JSON.stringify(unsupportedKeyValue)} }`,
    ''
  ].join('\n'), { mode: 0o600 });
  t.after(async () => fsp.rm(root, { recursive: true, force: true }));
  return { home, configPath, inlineValue, unsupportedKeyValue };
}

test('official adapter collapses transform stdout, stderr, and exceptions to fixed public codes', async (t) => {
  const s = await fixture(t);
  const before = await fsp.readFile(s.configPath, 'utf8');
  const operation: CodexCliMutationOperation = {
    action: 'edit',
    name: 'docs',
    server: { name: 'docs', transport: 'stdio', command: 'node' }
  };
  const outputLeak = `${s.inlineValue} ${s.unsupportedKeyValue}`;
  const outputAdapter = new CodexMcpCliAdapter({
    dependencies: {
      findExecutable: async () => '/fixture/codex',
      run: async () => processResult(1, outputLeak, outputLeak)
    }
  });
  const outputFailure = await outputAdapter.transform(before, operation);
  assert.equal(outputFailure.public_error, 'codex_mcp_edit_remove_failed');
  assert.doesNotMatch(JSON.stringify(outputFailure), new RegExp(s.inlineValue));
  assert.doesNotMatch(JSON.stringify(outputFailure), new RegExp(s.unsupportedKeyValue));

  const addFailure = await outputAdapter.transform(before, {
    action: 'add',
    name: 'new_docs',
    server: { name: 'new_docs', transport: 'stdio', command: 'node' }
  });
  assert.equal(addFailure.public_error, 'codex_mcp_mutation_failed');
  assert.doesNotMatch(JSON.stringify(addFailure), new RegExp(s.inlineValue));
  assert.doesNotMatch(JSON.stringify(addFailure), new RegExp(s.unsupportedKeyValue));

  const exceptionAdapter = new CodexMcpCliAdapter({
    dependencies: {
      findExecutable: async () => '/fixture/codex',
      run: async () => { throw new Error(outputLeak); }
    }
  });
  const exceptionFailure = await exceptionAdapter.transform(before, operation);
  assert.equal(exceptionFailure.public_error, 'codex_mcp_cli_transform_failed');
  assert.doesNotMatch(JSON.stringify(exceptionFailure), new RegExp(s.inlineValue));
  assert.doesNotMatch(JSON.stringify(exceptionFailure), new RegExp(s.unsupportedKeyValue));
});

test('mutation boundary removes every current inline env value from custom-port failure receipts', async (t) => {
  const s = await fixture(t);
  const leaked = `${s.inlineValue} ${s.unsupportedKeyValue}`;
  for (const mode of ['return', 'throw'] as const) {
    const cli = new LeakingCli(leaked, mode);
    const result = await editMcpServer('docs', { startup_timeout_sec: 11 }, 'global', { home: s.home, cli });
    const cliJson = JSON.stringify(result, null, 2);
    assert.equal(result.ok, false);
    assert.deepEqual(result.blockers, ['codex_mcp_cli_mutation_failed']);
    assert.equal(result.public_error, 'codex_mcp_cli_mutation_failed');
    assert.doesNotMatch(cliJson, new RegExp(s.inlineValue));
    assert.doesNotMatch(cliJson, new RegExp(s.unsupportedKeyValue));
    const unchanged = await fsp.readFile(s.configPath, 'utf8');
    assert.match(unchanged, new RegExp(s.inlineValue));
    assert.match(unchanged, new RegExp(s.unsupportedKeyValue));
  }
});

test('CLI JSON stays value-free when a fake Codex executable echoes the raw config', async (t) => {
  const s = await fixture(t);
  const fakeCodex = path.join(path.dirname(s.home), 'fake-codex.mjs');
  await fsp.writeFile(fakeCodex, [
    '#!/usr/bin/env node',
    "import fs from 'node:fs';",
    "import path from 'node:path';",
    "const file = path.join(process.env.CODEX_HOME || '', 'config.toml');",
    "process.stderr.write(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : 'missing config');",
    'process.exit(1);',
    ''
  ].join('\n'), { mode: 0o700 });

  const result = await executeMcpConfigCommand([
    'config', 'edit', 'docs', '--scope', 'global', '--home', s.home,
    '--stdin-json', '--codex', fakeCodex, '--json'
  ], { stdinJson: { startup_timeout_sec: 11 } }) as any;
  const cliJson = JSON.stringify(result, null, 2);
  assert.equal(result.ok, false);
  assert.deepEqual(result.blockers, ['codex_mcp_cli_mutation_failed']);
  assert.equal(result.public_error, 'codex_mcp_cli_mutation_failed');
  assert.doesNotMatch(cliJson, new RegExp(s.inlineValue));
  assert.doesNotMatch(cliJson, new RegExp(s.unsupportedKeyValue));
});

test('fallback warnings and post-write inventory failures cannot echo inline values', async (t) => {
  const s = await fixture(t);
  const leaked = `${s.inlineValue} ${s.unsupportedKeyValue}`;
  const cli = new LeakingCli(leaked, 'unsupported');
  const result = await editMcpServer('docs', { startup_timeout_sec: 12 }, 'global', { home: s.home, cli });
  const cliJson = JSON.stringify(result, null, 2);

  assert.equal(result.ok, true);
  assert.ok(result.warnings.includes('codex_cli_mutation_unsupported'));
  assert.equal(cli.listCalls, 1);
  assert.doesNotMatch(cliJson, new RegExp(s.inlineValue));
  assert.doesNotMatch(cliJson, new RegExp(s.unsupportedKeyValue));
  assert.equal(redactMcpErrorWithSecrets(`failure ${leaked}`, [s.inlineValue, s.unsupportedKeyValue]), 'failure <redacted> <redacted>');
});

class LeakingCli implements CodexMcpCliPort {
  listCalls = 0;

  constructor(
    private readonly leaked: string,
    private readonly mode: 'return' | 'throw' | 'unsupported'
  ) {}

  async list() {
    this.listCalls += 1;
    return { available: true, ok: false, rows: [], public_error: `list ${this.leaked}` };
  }

  async transform(_before: string, _operation: CodexCliMutationOperation) {
    if (this.mode === 'throw') throw new Error(`exception ${this.leaked}`);
    if (this.mode === 'unsupported') {
      return {
        available: true,
        ok: false,
        used: false,
        text: null,
        unsupported_reason: `unsupported ${this.leaked}`,
        public_error: `failure ${this.leaked}`
      };
    }
    return {
      available: true,
      ok: false,
      used: true,
      text: null,
      unsupported_reason: null,
      public_error: `failure ${this.leaked}`
    };
  }

  async login() { return { available: true, ok: false, public_error: `login ${this.leaked}` }; }
  async logout() { return { available: true, ok: false, public_error: `logout ${this.leaked}` }; }
}

function processResult(code: number, stdout: string, stderr: string) {
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
