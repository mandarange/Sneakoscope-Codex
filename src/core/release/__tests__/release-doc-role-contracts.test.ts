import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { packageRoot } from '../../fsx.js';
import { escapeRegExp } from '../../text/regex.js';

async function source(relative: string): Promise<string> {
  return fsp.readFile(path.join(packageRoot(), relative), 'utf8');
}

function proseContract(phrase: string): RegExp {
  return new RegExp(
    phrase
      .trim()
      .split(/\s+/)
      .map(escapeRegExp)
      .join('\\s+')
  );
}

test('release documentation prose contracts ignore wrapping but preserve exact words and order', () => {
  const contract = proseContract('clean worktree and refreshes the pack after source changes');
  assert.match('clean worktree and refreshes the pack after\nsource changes', contract);
  assert.doesNotMatch('clean worktree and refreshes a different pack after source changes', contract);
  assert.doesNotMatch('source changes after the pack refreshes a clean worktree', contract);
});

test('TriWiki code-pack parent-commit freshness semantics stay documented and code-backed', async () => {
  const [docs, freshness] = await Promise.all([
    source('docs/release-readiness.md'),
    source('src/core/triwiki/code-pack-head-freshness.ts')
  ]);
  assert.match(docs, proseContract('git_head_sha` is the generation parent commit'));
  assert.match(docs, proseContract('metadata-only code-pack commit'));
  assert.match(docs, proseContract('clean worktree and refreshes the pack after source changes'));
  for (const token of [
    'metadata_only_history',
    'source_change_history',
    'pack_not_ancestor',
    'history_truncated',
    'git_timeout'
  ]) assert.match(freshness, new RegExp(token));
});

