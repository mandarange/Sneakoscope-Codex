import path from 'node:path';
import { readStdin, sksRoot, writeJsonAtomic } from '../fsx.mjs';
import { createMission } from '../mission.mjs';
import { checkDbOperation, checkSqlFile, classifyCommand, classifySql, loadDbSafetyPolicy, safeSupabaseMcpConfig, scanDbSafety } from '../db-safety.mjs';
import { maybeFinalizeRoute } from '../proof/auto-finalize.mjs';
import { flag } from './command-utils.mjs';

export async function dbCommand(sub, args = []) {
  const root = await sksRoot();
  if (sub === 'policy') {
    console.log(JSON.stringify(await loadDbSafetyPolicy(root), null, 2));
    return;
  }
  if (sub === 'scan') {
    const report = await scanDbSafety(root, { includeMigrations: flag(args, '--migrations') });
    await finalizeDbCheck(root, { action: 'scan', args, result: report, exitCode: report.ok ? 0 : 2 });
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 2;
    return;
  }
  if (sub === 'mcp-config') {
    const projectIdx = args.indexOf('--project-ref');
    const featuresIdx = args.indexOf('--features');
    const projectRef = projectIdx >= 0 ? args[projectIdx + 1] : '<project_ref>';
    const features = featuresIdx >= 0 ? args[featuresIdx + 1] : 'database,docs';
    console.log(JSON.stringify(safeSupabaseMcpConfig({ projectRef, readOnly: true, features }), null, 2));
    return;
  }
  if (sub === 'classify' || sub === 'check') {
    const sqlIdx = args.indexOf('--sql');
    const commandIdx = args.indexOf('--command');
    const fileIdx = args.indexOf('--file');
    let result;
    if (fileIdx >= 0 && args[fileIdx + 1]) result = await checkSqlFile(path.resolve(args[fileIdx + 1]));
    else if (commandIdx >= 0 && args[commandIdx + 1]) result = classifyCommand(args[commandIdx + 1]);
    else if (sqlIdx >= 0 && args[sqlIdx + 1]) result = classifySql(args[sqlIdx + 1]);
    else if (sub === 'check' && args[0]) result = await checkSqlFile(path.resolve(args[0]));
    else result = classifySql(args.join(' ').trim());
    const blocked = ['destructive', 'write', 'possible_db'].includes(result.level);
    const proof = await finalizeDbCheck(root, { action: sub, args, result, exitCode: blocked ? 2 : 0 });
    const output = flag(args, '--json') ? { ...result, completion_proof: { ok: proof.ok, validation: proof.validation, mission_id: proof.proof?.mission_id } } : result;
    console.log(JSON.stringify(output, null, 2));
    process.exitCode = blocked ? 2 : 0;
    return;
  }
  if (sub === 'scan-payload') {
    const raw = await readStdin();
    const payload = raw.trim() ? JSON.parse(raw) : {};
    const decision = await checkDbOperation(root, {}, payload, { duringNoQuestion: false });
    await finalizeDbCheck(root, { action: 'scan-payload', args, result: decision, exitCode: decision.action === 'block' ? 2 : 0 });
    console.log(JSON.stringify(decision, null, 2));
    process.exitCode = decision.action === 'block' ? 2 : 0;
    return;
  }
  console.error('Usage: sks db policy | db scan [--migrations] | db mcp-config --project-ref <id> | db check --sql "..." | db check --command "..." | db check --file file.sql');
  process.exitCode = 1;
}

async function finalizeDbCheck(root, { action, args, result, exitCode }) {
  const prompt = `sks db ${action} ${args.join(' ')}`.trim();
  const { id, dir } = await createMission(root, { mode: 'db', prompt });
  const blocked = exitCode !== 0 || result.action === 'block' || result.level === 'destructive';
  const report = {
    schema: 'sks.db-operation-report.v1',
    mission_id: id,
    action,
    command: prompt,
    result,
    status: blocked ? 'blocked' : 'verified_partial',
    db_safety: {
      ok: !blocked,
      level: result.level || result.risk || result.status || null,
      action: result.action || action,
      destructive_blocked: blocked && /drop|delete|truncate|reset|destructive/i.test(JSON.stringify(result))
    }
  };
  await writeJsonAtomic(path.join(dir, 'db-operation-report.json'), report);
  const gate = { schema_version: 1, passed: !blocked, ok: !blocked, status: blocked ? 'blocked' : 'pass', db_operation_report: 'db-operation-report.json' };
  await writeJsonAtomic(path.join(dir, 'db-gate.json'), gate);
  return maybeFinalizeRoute(root, {
    missionId: id,
    route: '$DB',
    gateFile: 'db-gate.json',
    gate,
    artifacts: ['db-operation-report.json', 'completion-proof.json'],
    dbEvidence: report.db_safety,
    statusHint: blocked ? 'blocked' : 'verified_partial',
    blockers: blocked ? ['db_operation_blocked'] : [],
    command: { cmd: prompt, status: exitCode }
  });
}
