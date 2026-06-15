import path from 'node:path';
import { nowIso, writeJsonAtomic } from '../fsx.js';
import { syncCoreSkillsIntegrity } from './core-skill-integrity.js';
import {
  buildNativeCapabilityRepairMatrix,
  ensureNativeCapabilityArtifactRoots,
  type NativeCapabilityId,
  type NativeCapabilityRepairMatrix
} from './native-capability-repair-matrix.js';
import { postcheckNativeCapabilities } from './native-capability-postcheck.js';

export async function repairNativeCapabilities(input: {
  root: string;
  fix: boolean;
  yes: boolean;
  capabilities?: NativeCapabilityId[];
  allowManualInstructions?: boolean;
  fixture?: 'all-repairable' | 'manual-required' | false;
}): Promise<NativeCapabilityRepairMatrix> {
  const root = path.resolve(input.root);
  const capabilitySelection = input.capabilities ? { capabilities: input.capabilities } : {};
  const before = await buildNativeCapabilityRepairMatrix({
    root,
    ...capabilitySelection,
    fixture: input.fixture || false,
    reportPath: path.join(root, '.sneakoscope', 'reports', 'native-capability-repair-matrix-before.json')
  });
  const repaired: string[] = [];
  if (input.fix) {
    repaired.push(...await ensureNativeCapabilityArtifactRoots(root));
    await syncCoreSkillsIntegrity({ root, apply: true }).catch(() => undefined);
  }
  const afterMatrix = await buildNativeCapabilityRepairMatrix({
    root,
    ...capabilitySelection,
    fixture: input.fixture || false,
    reportPath: path.join(root, '.sneakoscope', 'reports', 'native-capability-repair-matrix.json')
  });
  const postcheck = await postcheckNativeCapabilities({
    root,
    matrix: afterMatrix,
    fixture: input.fixture || false,
    reportPath: path.join(root, '.sneakoscope', 'reports', 'native-capability-postcheck.json')
  });
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'native-capability-repair.json'), {
    schema: 'sks.native-capability-repair.v1',
    generated_at: nowIso(),
    ok: postcheck.ok,
    fix: input.fix,
    yes: input.yes,
    before,
    after: postcheck,
    repaired_artifacts: repaired,
    manual_required: postcheck.capabilities
      .filter((state) => state.repairability === 'manual-required' && state.after !== 'verified')
      .map((state) => ({ id: state.id, actions: state.repair_actions }))
  }).catch(() => undefined);
  return postcheck;
}
