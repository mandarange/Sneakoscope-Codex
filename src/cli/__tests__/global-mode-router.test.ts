import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectGlobalMode,
  findRetiredGlobalExecutionArgumentErrors,
  glmWithoutMadResult,
  stripGlobalModeFlags
} from '../global-mode-router.js';

test('detectGlobalMode routes top-level --mad --glm before command dispatch', () => {
  assert.deepEqual(detectGlobalMode(['--mad', '--glm', '--json']), {
    kind: 'mad-glm',
    args: ['--json']
  });
  assert.equal(detectGlobalMode(['--mad', '--json']), null);
  assert.deepEqual(detectGlobalMode(['--mad', '--glm', 'naruto', '--json']), {
    kind: 'mad-glm',
    args: ['naruto', '--json']
  });
  assert.deepEqual(stripGlobalModeFlags(['--mad', '--glm', '--repair']), ['--repair']);
  assert.deepEqual(stripGlobalModeFlags(['--mad', '--glm', '--deep', '--trace']), ['--deep', '--trace']);
  assert.deepEqual(stripGlobalModeFlags(['--mad', '--glm', '--bench', '--json']), ['--bench', '--json']);
});

test('detectGlobalMode blocks bare --glm and leaves help/version alone', () => {
  assert.deepEqual(detectGlobalMode(['--glm']), { kind: 'glm-without-mad', args: [] });
  assert.equal(detectGlobalMode(['naruto', '--glm', '--json']), null);
  assert.equal(detectGlobalMode(['help']), null);
  assert.equal(detectGlobalMode(['version']), null);
  assert.equal(glmWithoutMadResult().hint, 'use sks --mad --glm');
});

test('retired global execution options are exact-match blockers', () => {
  assert.deepEqual(findRetiredGlobalExecutionArgumentErrors([
    '--naruto',
    '--agent=worker',
    '--clones',
    '--mad-db',
    '--mad-native-swarm',
    '--mad-swarm-backend=codex-sdk',
    '--tmux-smoke',
    '--naruto'
  ]), [
    'unsupported_argument:--naruto',
    'unsupported_argument:--agent',
    'unsupported_argument:--clones',
    'unsupported_argument:--mad-db',
    'unsupported_argument:--mad-native-swarm',
    'unsupported_argument:--mad-swarm-backend',
    'unsupported_argument:--tmux-smoke'
  ]);
  assert.deepEqual(findRetiredGlobalExecutionArgumentErrors([
    'naruto',
    '--agents',
    '--agent-model',
    '--clonescope',
    '--mad-db2'
  ]), []);
});
