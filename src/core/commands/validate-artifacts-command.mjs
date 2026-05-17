import path from 'node:path';
import { readJson, sksRoot, writeJsonAtomic } from '../fsx.mjs';
import { loadMission } from '../mission.mjs';
import { ARTIFACT_FILES, writeValidationReport } from '../artifact-schemas.mjs';
import { evaluateResearchGate } from '../research.mjs';
import { flag, readFlagValue, resolveMissionId } from './command-utils.mjs';

export async function validateArtifactsCommand(args = []) {
  const root = await sksRoot();
  const missionArg = args[0] && !String(args[0]).startsWith('--') ? args[0] : 'latest';
  const id = await resolveMissionId(root, missionArg);
  const loaded = id ? await loadMission(root, id) : null;
  const targetDir = loaded ? loaded.dir : root;
  const requiredRaw = readFlagValue(args, '--required', '');
  const required = requiredRaw === 'all'
    ? Object.keys(ARTIFACT_FILES)
    : String(requiredRaw || '').split(',').map((x) => x.trim()).filter(Boolean);
  const report = await writeValidationReport(targetDir, { required });
  const missionMode = String(loaded?.mission?.mode || '').toLowerCase();
  if (missionMode === 'research' || await existsFile(path.join(targetDir, 'research-gate.json'))) {
    const researchGate = await evaluateResearchGate(targetDir);
    report.route_gate = { route: 'Research', ok: researchGate.passed === true, gate_file: 'research-gate.evaluated.json', reasons: researchGate.reasons || [] };
    if (!report.route_gate.ok) {
      report.ok = false;
      report.errors = [...(report.errors || []), ...report.route_gate.reasons.map((reason) => `research-gate:${reason}`)];
    }
    await writeJsonAtomic(path.join(targetDir, 'artifact-validation.json'), report);
  }
  if (flag(args, '--json')) return console.log(JSON.stringify(report, null, 2));
  console.log(`Artifact validation: ${report.ok ? 'pass' : 'fail'}`);
  console.log(`Target: ${path.relative(root, targetDir) || '.'}`);
  if (report.route_gate) console.log(`Route gate: ${report.route_gate.route} ${report.route_gate.ok ? 'pass' : `fail (${report.route_gate.reasons.join(', ')})`}`);
  if (report.missing.length) console.log(`Missing: ${report.missing.join(', ')}`);
  for (const [schema, result] of Object.entries(report.results)) console.log(`${schema}: ${result.ok ? 'pass' : `fail (${result.errors.join(', ')})`}`);
  if (!report.ok) process.exitCode = 2;
}

async function existsFile(file) {
  try {
    await readJson(file);
    return true;
  } catch {
    return false;
  }
}
