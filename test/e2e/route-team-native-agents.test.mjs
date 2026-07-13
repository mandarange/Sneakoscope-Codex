import test from 'node:test';
import assert from 'node:assert/strict';
import { createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';

test('legacy Team Zellij mutation commands are removed and point to official Naruto evidence', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'team-zellij-mutations-removed' });

  for (const subcommand of ['open-zellij', 'attach-zellij', 'cleanup-zellij']) {
    const result = await runSksInRoot(root, ['team', subcommand, 'latest', '--json'], { expectCode: 2 });
    assert.equal(result.schema, 'sks.team-legacy-observe.v1', subcommand);
    assert.equal(result.ok, false, subcommand);
    assert.equal(result.status, 'removed_non_read_only_surface', subcommand);
    assert.equal(result.subcommand, subcommand);
    assert.match(result.replacement, /naruto status\|subagents\|proof/i);
    assert.deepEqual(result.read_only_commands, ['log', 'tail', 'watch', 'lane', 'status']);
  }
});

test('Zellij status no longer advertises removed Team mutation commands', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'zellij-status-no-team-mutation' });
  const result = await runSksInRoot(root, ['zellij', 'status', '--json']);
  assert.equal(result.schema, 'sks.zellij-command.v1');
  assert.equal(result.subcommand, 'status');
  assert.equal(result.required_for.some((entry) => /team open-zellij/i.test(entry)), false);
});
