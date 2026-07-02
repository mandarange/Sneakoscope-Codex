import path from 'node:path';
import { exists, readJson, readText } from '../fsx.js';

export async function context7EvidenceStatus(root: string, missionId: string | null = null) {
  const candidates = [
    missionId ? path.join(root, '.sneakoscope', 'missions', missionId, 'context7-evidence.jsonl') : null,
    path.join(root, '.sneakoscope', 'state', 'context7-evidence.jsonl'),
    path.join(root, '.sneakoscope', 'memory', 'q2_facts', 'stack-current-docs.md')
  ].filter(Boolean) as string[];
  for (const file of candidates) {
    if (!(await exists(file))) continue;
    const text = await readText(file, '');
    if (/\S/.test(text) && /(context7|resolve[-_]?library|query[-_]?docs|get[-_]?library|official docs|vendor docs)/i.test(text)) {
      return { ok: true, policy: 'required_satisfied', evidence: path.relative(root, file).split(path.sep).join('/') };
    }
  }
  return { ok: false, policy: 'required_not_satisfied', evidence: null, blocker: 'context7_policy_required_not_satisfied' };
}

export async function artifactPresence(root: string, dir: string, artifacts: string[]) {
  const rows = await Promise.all(artifacts.map(async (artifact) => {
    const file = path.isAbsolute(artifact) ? artifact : path.join(dir, artifact);
    return { artifact, present: await exists(file) };
  }));
  const missing = rows.filter((row) => !row.present).map((row) => row.artifact);
  return { ok: missing.length === 0, rows, missing };
}

export async function evaluateLocalGate(input: {
  root: string;
  missionId?: string | null;
  dir?: string | null;
  gateFile: string;
  requiredArtifacts?: string[];
  requiredSections?: string[];
}) {
  const missionDir = input.dir || (input.missionId ? path.join(input.root, '.sneakoscope', 'missions', input.missionId) : input.root);
  const gatePath = path.isAbsolute(input.gateFile) ? input.gateFile : path.join(missionDir, input.gateFile);
  const gate = await readJson(gatePath, null);
  const blockers: string[] = [];
  if (!gate) blockers.push(`${path.basename(input.gateFile)}_missing`);
  if (gate) {
    if (!(gate.passed === true || gate.ok === true || gate.status === 'pass' || gate.status === 'passed')) blockers.push('gate_not_passed');
    if (gate.ok === false) blockers.push('gate_ok_false');
    if (Array.isArray(gate.blockers) && gate.blockers.length) blockers.push(...gate.blockers.map(String));
    if (Array.isArray(gate.missing_fields) && gate.missing_fields.length) blockers.push(...gate.missing_fields.map((field: any) => `missing_field:${field}`));
    for (const section of input.requiredSections || []) {
      if (gate[section] == null) blockers.push(`missing_gate_section:${section}`);
    }
  }
  const artifactCheck = await artifactPresence(input.root, missionDir, input.requiredArtifacts || []);
  blockers.push(...artifactCheck.missing.map((artifact) => `missing_artifact:${artifact}`));
  const uniqueBlockers = [...new Set(blockers)];
  return {
    ok: uniqueBlockers.length === 0,
    gate,
    gate_path: gatePath,
    blockers: uniqueBlockers,
    artifacts: artifactCheck
  };
}
