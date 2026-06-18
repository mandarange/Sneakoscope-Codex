import fs from 'node:fs';
import path from 'node:path';

export interface CriticalPathLedger {
  schema: 'sks.critical-path-ledger.v1';
  run_id: string;
  sequential_ms: number;
  critical_path_ms: number;
  wall_ms: number;
  parallelism_gain: number;
  resource_wait_ms: Record<string, number>;
  top_blockers: Array<{ id: string; wait_ms: number; run_ms: number }>;
}

export function buildCriticalPathLedger(input: Omit<CriticalPathLedger, 'schema'>): CriticalPathLedger {
  return { schema: 'sks.critical-path-ledger.v1', ...input };
}

export function writeCriticalPathLedger(root: string, ledger: CriticalPathLedger): string {
  const file = path.join(root, '.sneakoscope', 'reports', 'critical-path-ledger.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(ledger, null, 2)}\n`);
  return file;
}
