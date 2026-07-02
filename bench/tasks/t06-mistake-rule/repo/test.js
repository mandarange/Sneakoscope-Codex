import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { loadJson } from './src/loader.js';

const source = await fs.readFile(new URL('./src/loader.js', import.meta.url), 'utf8');
assert.ok(!/catch\s*\([^)]*\)\s*\{\s*\}/.test(source), 'empty catch must be removed');
await assert.rejects(() => loadJson(async () => '{bad json'));
