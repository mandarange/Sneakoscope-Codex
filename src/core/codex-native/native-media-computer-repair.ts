import { repairNativeCapabilities } from './native-capability-repair.js';
import type { NativeCapabilityId, NativeCapabilityRepairMatrix } from './native-capability-repair-matrix.js';

export async function repairNativeMediaComputerCapabilities(input: {
  root: string;
  fix: boolean;
  yes: boolean;
  capabilities?: NativeCapabilityId[];
  fixture?: 'all-repairable' | 'manual-required' | false;
}): Promise<NativeCapabilityRepairMatrix> {
  return repairNativeCapabilities(input);
}
