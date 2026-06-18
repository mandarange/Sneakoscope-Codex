import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGlmSpeedContext } from '../glm-speed-context.js';

test('GLM speed context stays compact and excludes generated paths', async () => {
  const context = await buildGlmSpeedContext({
    task: 'edit foo',
    cwd: '/repo',
    gitStatus: ' M src/foo.ts',
    mentionedPaths: ['src/foo.ts', 'dist/foo.js', 'node_modules/pkg/index.js'],
    readFile: async (file) => file.endsWith('src/foo.ts') ? 'export const foo = 1;\n' : null
  });
  assert.equal(context.schema, 'sks.glm-speed-context.v1');
  assert.equal(context.estimatedTokens <= 16_000, true);
  assert.equal(context.sections.some((section) => section.path === 'src/foo.ts'), true);
  assert.equal(context.omitted.some((row) => row.path === 'dist/foo.js'), true);
  assert.equal(context.omitted.some((row) => row.path === 'node_modules/pkg/index.js'), true);
});

test('GLM speed context passes byte caps to snippet readers', async () => {
  let requestedMaxBytes = 0;
  const context = await buildGlmSpeedContext({
    task: 'edit huge',
    cwd: '/repo',
    mentionedPaths: ['src/huge.ts'],
    maxFileBytes: 2048,
    readFileSnippet: async (_file, maxBytes) => {
      requestedMaxBytes = maxBytes;
      return 'x'.repeat(4096);
    }
  });
  assert.equal(requestedMaxBytes, 2048);
  assert.equal(context.omitted.some((row) => row.reason === 'speed_context_file_byte_budget'), true);
  assert.equal(context.sections.find((section) => section.path === 'src/huge.ts')?.content.length, 2048);
});
