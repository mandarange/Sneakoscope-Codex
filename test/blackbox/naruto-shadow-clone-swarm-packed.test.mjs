import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('packed $Naruto official subagent workflow gate passes through the compatibility entrypoint', () => {
  const result = spawnSync(process.execPath, ['dist/scripts/naruto-shadow-clone-swarm-check.js'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('dist Naruto fast and direct JSON help share one runnable schema', () => {
  const fast = spawnSync(process.execPath, ['dist/bin/sks.js', 'naruto', 'help', '--json'], { encoding: 'utf8' });
  const direct = spawnSync(process.execPath, ['dist/bin/sks.js', 'naruto', '-h', '--json'], { encoding: 'utf8' });
  assert.equal(fast.status, 0, fast.stderr || fast.stdout);
  assert.equal(direct.status, 0, direct.stderr || direct.stdout);
  assert.deepEqual(JSON.parse(fast.stdout), JSON.parse(direct.stdout));
});

test('dist Naruto text help uses the shared CLI status vocabulary', () => {
  const result = spawnSync(process.execPath, ['dist/bin/sks.js', 'naruto', 'help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /^SKS \d+\.\d+\.\d+ · naruto help\n✔ official subagent workflow help available\n/m);
});

test('dist Naruto JSON help rejects malformed fanout and removed model flags', () => {
  for (const args of [
    ['naruto', 'help', '--json', '--agents'],
    ['naruto', 'help', '--json', '--model', 'gpt-5.6-terra']
  ]) {
    const result = spawnSync(process.execPath, ['dist/bin/sks.js', ...args], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, `${args.join(' ')}\n${result.stderr || result.stdout}`);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, false);
    assert.match(JSON.stringify(parsed), /missing_option_value:--agents|removed_legacy_process_flag:--model/);
  }
});
