import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { writeMissionArtifacts } from '../glm-naruto-trace.js';

test('mission aggregate artifacts redact secret-like keys before write', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-glm-artifact-redaction-'));
  const dir = await writeMissionArtifacts({
    root,
    missionId: 'M-test',
    workerTraces: [],
    providerHealth: { schema: 'fixture', api_key: 'plain-secret-value' }
  });
  const written = JSON.parse(await fsp.readFile(path.join(dir, 'provider-health.json'), 'utf8')) as Record<string, unknown>;
  assert.equal(written.api_key, '[REDACTED]');
});
