import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { readJson, tmpdir } from '../../fsx.js';
import { writeRouteCompletionProof } from '../route-adapter.js';

test('post-route retention preserves an active managed temp project and its completion proof', async () => {
  const root = tmpdir('sks-route-retention-active-');
  try {
    const result: any = await writeRouteCompletionProof(root, {
      missionId: 'M-route-retention-active',
      route: '$Wiki',
      status: 'verified_partial',
      claims: [{ id: 'active-temp-proof', status: 'supported' }]
    });

    assert.equal(result.retention?.ok, true);
    assert.equal(result.proof?.route, '$sks-wiki');
    const proof = path.join(root, '.sneakoscope', 'missions', 'M-route-retention-active', 'completion-proof.json');
    assert.equal(await fsp.access(proof).then(() => true, () => false), true);
    const afterProof = await fsp.mkdtemp(path.join(root, 'after-proof-'));
    assert.equal(await fsp.access(afterProof).then(() => true, () => false), true);

    const cleanup = await readJson<any>(path.join(root, '.sneakoscope', 'reports', 'retention-cleanup.json'));
    assert.ok(cleanup.actions.some((action: any) => action.action === 'skip_sks_temp_sweep'
      && action.reason === 'post_route_global_temp_isolation'));
    assert.equal(cleanup.actions.some((action: any) => action.action === 'remove_sks_temp' && action.path === root), false);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});
