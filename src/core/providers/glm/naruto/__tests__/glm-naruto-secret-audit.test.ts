import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { auditContentForSecrets, auditGlmNarutoArtifactsForSecrets } from '../glm-naruto-secret-audit.js';

test('secret audit detects JSON key-level secrets and allows redacted markers', () => {
  assert.deepEqual(auditContentForSecrets(JSON.stringify({ api_key: 'plain-value' })), ['secret_key:api_key']);
  assert.deepEqual(auditContentForSecrets(JSON.stringify({ authorization: 'Bearer [REDACTED]' })), []);
});

test('secret audit scans jsonl files for secret-like keys', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-glm-secret-audit-'));
  await fsp.writeFile(path.join(root, 'artifact.jsonl'), `${JSON.stringify({ token: 'abc123' })}\n`, 'utf8');
  const result = await auditGlmNarutoArtifactsForSecrets(root);
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((finding) => finding.includes('secret_key:token')));
});
