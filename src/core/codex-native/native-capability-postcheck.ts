import path from 'node:path';
import { writeJsonAtomic } from '../fsx.js';
import { buildNativeCapabilityRepairMatrix, type NativeCapabilityRepairMatrix, type NativeCapabilityRepairState } from './native-capability-repair-matrix.js';

export async function postcheckNativeCapabilities(input: {
  root: string;
  matrix?: NativeCapabilityRepairMatrix | null;
  fixture?: 'all-repairable' | 'manual-required' | false;
  reportPath?: string | null;
}): Promise<NativeCapabilityRepairMatrix> {
  const root = path.resolve(input.root);
  const matrix = input.matrix || await buildNativeCapabilityRepairMatrix({ root, fixture: input.fixture || false, reportPath: null });
  const capabilities = matrix.capabilities.map((state): NativeCapabilityRepairState => {
    const verifiedAfterRepair = state.repairability === 'auto' || state.repairability === 'doctor-fix';
    if (state.id === 'computer_use' && process.env.SKS_COMPUTER_USE_CAPABILITY !== 'verified') {
      return { ...state, after: 'unknown', blockers: ['computer_use_os_permission_or_capability_unknown'] };
    }
    if (state.id === 'chrome_web_review' && process.env.SKS_CHROME_EXTENSION_READY !== '1' && input.fixture !== 'all-repairable') {
      return { ...state, after: 'unknown', blockers: ['codex_chrome_extension_readiness_not_verified'] };
    }
    if (state.blockers.length === 0 || verifiedAfterRepair) return { ...state, after: state.repairability === 'manual-required' ? 'unknown' : 'verified', blockers: state.repairability === 'manual-required' ? state.blockers : [] };
    return { ...state, after: 'blocked' };
  });
  const blockers = capabilities.flatMap((state) => state.after === 'verified' ? [] : state.blockers);
  const checked: NativeCapabilityRepairMatrix = {
    ...matrix,
    generated_at: new Date().toISOString(),
    ok: blockers.length === 0,
    capabilities,
    blockers,
    warnings: capabilities.flatMap((state) => state.warnings)
  };
  const reportPath = input.reportPath === null
    ? null
    : input.reportPath || path.join(root, '.sneakoscope', 'reports', 'native-capability-postcheck.json');
  if (reportPath) await writeJsonAtomic(reportPath, checked).catch(() => undefined);
  return checked;
}
