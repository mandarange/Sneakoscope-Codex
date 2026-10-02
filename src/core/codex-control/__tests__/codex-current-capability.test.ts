import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { detectCodexCurrentCapability } from '../codex-current-capability.js';
import { CURRENT_CODEX_RUNTIME_CONTRACT } from '../../codex-compat/codex-runtime-contract.js';

async function writeStubCodex(root: string, schemaGeneration: 'writes_schema' | 'fails'): Promise<string> {
  const codexBin = path.join(root, 'codex');
  await fsp.writeFile(codexBin, [
    '#!/bin/sh',
    'if [ "$1" = "--version" ]; then',
    // The stub must report the CURRENT contract version: an older CLI is its own blocker, not the behavior under test.
    `  echo "codex-cli ${CURRENT_CODEX_RUNTIME_CONTRACT.minVersion}"`,
    '  exit 0',
    'fi',
    ...(schemaGeneration === 'writes_schema'
      ? ['mkdir -p "$4"', 'echo \'{"definitions":{"fixture":true}}\' > "$4/ClientRequest.json"', 'exit 0']
      : ['echo "schema generation intentionally disabled" >&2', 'exit 17']),
    ''
  ].join('\n'), { mode: 0o755 });
  return codexBin;
}

test('capability detection is release-authorizing only when the runtime generates its App Server schema', {
  skip: process.platform === 'win32'
}, async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-codex-current-capability-'));
  try {
    const okBin = await writeStubCodex(root, 'writes_schema');
    const ok = await detectCodexCurrentCapability({ root, codexBin: okBin });
    assert.equal(ok.ok, true);
    assert.equal(ok.probe_mode, 'real-schema');
    assert.equal(ok.release_authorizing, true);
    assert.match(String(ok.generated_schema_sha256), /^[0-9a-f]{64}$/);
    assert.deepEqual(Object.keys(ok.feature_states).sort(), ['protocol_schema_generation', 'runtime_identity']);

    const failBin = await writeStubCodex(root, 'fails');
    const failed = await detectCodexCurrentCapability({ root, codexBin: failBin });
    assert.equal(failed.ok, false);
    assert.equal(failed.probe_mode, 'blocked');
    assert.equal(failed.release_authorizing, false);
    assert.ok(failed.blockers.includes('codex_current_schema_generation_failed'));
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});
