import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlmToolSchemaCache, digestToolset } from '../glm-tool-schema-cache.js';

test('tool schema cache hits by toolset version', () => {
  const cache = createGlmToolSchemaCache();
  const tools = [{ type: 'function', function: { name: 'read_file' } }];
  const key = digestToolset(tools);
  assert.equal(cache.get(key), null);
  cache.set(key, tools);
  assert.equal(cache.get(key)?.tools, tools);
  assert.equal(cache.get('different'), null);
});
