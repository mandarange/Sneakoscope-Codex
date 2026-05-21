import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDfixErrorSignature } from '../../dist/core/dfix/error-signature.js';

test('DFix error signature extracts code, file, line, kind, and hash', () => {
  const signature = buildDfixErrorSignature({
    cwd: '/repo',
    command: 'npm run typecheck',
    error: 'src/core/foo.ts:12:5 - error TS2345: TypeError undefined value'
  });
  assert.equal(signature.file, 'src/core/foo.ts');
  assert.equal(signature.line, 12);
  assert.equal(signature.error_code, 'TS2345');
  assert.equal(signature.error_kind, 'typescript');
  assert.match(signature.signature_hash, /^[a-f0-9]{24}$/);
});
