import path from 'node:path';
import { exists, readJson } from '../fsx.js';

export type GateVerdictKind = 'pass' | 'fail' | 'mock_only' | 'missing' | 'invalid';

export interface GateVerdict {
  pass: boolean;
  verdict: GateVerdictKind;
  reasons: string[];
  gate_path?: string;
  gate?: Record<string, unknown> | null;
}

export async function evaluateGate(root: string, missionId: string, gateFile: string): Promise<GateVerdict> {
  const gatePath = path.isAbsolute(gateFile)
    ? gateFile
    : path.join(root, '.sneakoscope', 'missions', missionId, gateFile);

  if (!(await exists(gatePath))) {
    return { pass: false, verdict: 'missing', reasons: ['gate_file_missing'], gate_path: gatePath, gate: null };
  }

  const gate = await readJson(gatePath, null) as Record<string, unknown> | null;
  if (!gate || typeof gate !== 'object' || Array.isArray(gate)) {
    return { pass: false, verdict: 'invalid', reasons: ['gate_json_invalid'], gate_path: gatePath, gate: null };
  }

  const blockers = Array.isArray(gate.blockers) ? gate.blockers : null;
  const reasons: string[] = [];
  if (gate.execution_class === 'mock_fixture') {
    if (gate.passed !== true) reasons.push('gate_not_passed');
    if (gate.ok === false) reasons.push('gate_ok_false');
    if (!blockers) reasons.push('gate_blockers_not_array');
    else if (blockers.length > 0) reasons.push('gate_blockers_present');
    return { pass: false, verdict: 'mock_only', reasons: reasons.length ? reasons : ['gate_execution_class_mock_fixture'], gate_path: gatePath, gate };
  }
  if (gate.passed !== true) reasons.push('gate_not_passed');
  if (gate.ok === false) reasons.push('gate_ok_false');
  if (!blockers) reasons.push('gate_blockers_not_array');
  else if (blockers.length > 0) reasons.push('gate_blockers_present');
  if (gateFile === 'mad-sks-gate.json' || /mad-sks-gate\.json$/.test(gatePath)) {
    const sqlPlane = (gate as any).sql_plane;
    if (sqlPlane?.requested === true) {
      if (sqlPlane.read_back_passed !== true) reasons.push('mad_sks_sql_plane_read_back_not_passed');
      if (sqlPlane.profile_closed !== true) reasons.push('mad_sks_sql_plane_profile_not_closed');
    }
  }

  if (reasons.length > 0) {
    return { pass: false, verdict: 'fail', reasons, gate_path: gatePath, gate };
  }
  return { pass: true, verdict: 'pass', reasons: [], gate_path: gatePath, gate };
}
