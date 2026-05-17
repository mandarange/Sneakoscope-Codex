import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySql } from '../../src/core/db-safety.mjs';

test('db safety classifies destructive SQL', () => {
  const result = classifySql('DROP TABLE users;');
  assert.ok(result.level === 'destructive' || result.kind === 'destructive' || result.findings?.length);
});
