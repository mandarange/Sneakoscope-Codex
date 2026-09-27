import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ensureUserReadOnlyListRole,
  readOnlyListRoleContent,
  readOnlyListRoleInstalled,
  userReadOnlyListRolePath
} from '../read-only-list-role.js';

test('the user-level read-only list role serves every project and never replaces a file SKS does not own', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-read-only-role-'));
  const project = path.join(home, 'project');
  try {
    assert.equal(readOnlyListRoleInstalled(project, home), false);
    assert.equal(await ensureUserReadOnlyListRole(home), 'created');
    assert.equal(await ensureUserReadOnlyListRole(home), 'unchanged');
    assert.equal(readOnlyListRoleInstalled(project, home), true);
    const text = await fs.readFile(userReadOnlyListRolePath(home), 'utf8');
    assert.equal(text, readOnlyListRoleContent());
    assert.match(text, /sandbox_mode = "read-only"/);
    assert.doesNotMatch(text, /^model\s*=/m);

    await fs.writeFile(userReadOnlyListRolePath(home), 'name = "read_only_list_child"\nmodel = "mine"\n', 'utf8');
    assert.equal(await ensureUserReadOnlyListRole(home), 'preserved_user_file');
    assert.match(await fs.readFile(userReadOnlyListRolePath(home), 'utf8'), /model = "mine"/);
    assert.equal(readOnlyListRoleInstalled(project, home), false);
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});
