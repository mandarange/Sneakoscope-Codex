import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  buildCodexExecResumeOutputSchemaArgs,
  parseStructuredCodexOutput,
  validateStructuredOutput
} from '../../dist/core/codex-exec-output-schema.js';

test('Codex exec resume output-schema builder is schema-bound', async () => {
  const schemaPath = path.join(process.cwd(), 'schemas/codex/image-ux-issue-ledger.schema.json');
  const args = await buildCodexExecResumeOutputSchemaArgs({ sessionId: 'fixture-123', outputSchemaPath: schemaPath });
  assert.deepEqual(args.slice(0, 4), ['exec', 'resume', '--json', '--output-schema']);
  const parsed = parseStructuredCodexOutput('{"ok":true}');
  assert.equal(parsed.ok, true);
  assert.equal(validateStructuredOutput(parsed.value, { required: ['ok'] }).ok, true);
});
