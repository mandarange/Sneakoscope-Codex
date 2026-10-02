import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  buildCodexExecOutputSchemaArgs,
  buildCodexExecResumeOutputSchemaArgs
} from '../../dist/core/codex-exec-output-schema.js';

test('fresh codex exec and exec resume builders preserve their distinct argument order', async () => {
  const schemaPath = path.join(process.cwd(), 'schemas/codex/image-ux-issue-ledger.schema.json');
  const fresh = await buildCodexExecOutputSchemaArgs({
    prompt: 'Return structured issue ledger JSON.',
    outputSchemaPath: schemaPath,
    outputFile: path.join(process.cwd(), '.sneakoscope/tmp/fresh.json')
  });
  const resume = await buildCodexExecResumeOutputSchemaArgs({
    sessionId: 'session-123',
    prompt: 'Continue with structured output.',
    outputSchemaPath: schemaPath,
    outputFile: path.join(process.cwd(), '.sneakoscope/tmp/resume.json')
  });

  assert.deepEqual(fresh.slice(0, 3), ['exec', '--json', '--output-schema']);
  assert.ok(fresh.includes('Return structured issue ledger JSON.'));
  assert.deepEqual(resume.slice(0, 4), ['exec', 'resume', '--json', '--output-schema']);
  assert.ok(resume.includes('session-123'));
});
