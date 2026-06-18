import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createGlmBenchFixture, cloneFixture, resetFixture, BENCH_FIXTURE_TASK, BENCH_FIXTURE_INITIAL } from '../glm-bench-fixture.js';

test('fixture creates temp git repo with initial content', async () => {
  const fixture = await createGlmBenchFixture();
  try {
    const content = await fs.readFile(path.join(fixture.fixture_dir, fixture.target_file), 'utf8');
    assert.equal(content, BENCH_FIXTURE_INITIAL);
    assert.equal(fixture.task, BENCH_FIXTURE_TASK);
    assert.equal(fixture.schema, 'sks.glm-bench-fixture.v1');
  } finally {
    await fs.rm(fixture.fixture_dir, { recursive: true, force: true });
  }
});

test('cloneFixture produces independent repo copy', async () => {
  const source = await createGlmBenchFixture();
  try {
    const clone = await cloneFixture(source, 'test');
    try {
      const content = await fs.readFile(path.join(clone.fixture_dir, clone.target_file), 'utf8');
      assert.equal(content, source.initial_content);
      assert.notEqual(clone.fixture_dir, source.fixture_dir);
    } finally {
      await fs.rm(clone.fixture_dir, { recursive: true, force: true });
    }
  } finally {
    await fs.rm(source.fixture_dir, { recursive: true, force: true });
  }
});

test('resetFixture restores fixture to clean state', async () => {
  const fixture = await createGlmBenchFixture();
  try {
    await fs.writeFile(path.join(fixture.fixture_dir, fixture.target_file), 'export const value = 999;\n');
    await resetFixture(fixture);
    const content = await fs.readFile(path.join(fixture.fixture_dir, fixture.target_file), 'utf8');
    assert.equal(content, fixture.initial_content);
  } finally {
    await fs.rm(fixture.fixture_dir, { recursive: true, force: true });
  }
});
