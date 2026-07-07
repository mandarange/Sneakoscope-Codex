import { dirSize, formatBytes, packageRoot, projectRoot, sksRoot } from '../fsx.js';
import { applyRetentionPlan, enforceRetention, lightweightStorageReport, refreshMissionIndex, retentionStatus, storageReport } from '../retention.js';
import { flag } from './command-utils.js';
import { projectTriwikiToAgentsMd } from '../triwiki/agents-md-projector.js';
import { compileMistakeRules } from '../verification/mistake-rule-compiler.js';

export async function memoryCommand(sub: any, args: any = []) {
  const action = String(sub || '').toLowerCase();
  if (['build', 'project', 'agents', 'agents-md'].includes(action)) {
    const root = await projectRoot();
    const [result, rules] = await Promise.all([
      projectTriwikiToAgentsMd(root, { maxLocalFiles: Number(readOption(args, '--max-local-files', 8)) }),
      compileMistakeRules(root).catch((err) => ({ compiled: [], skipped: [`compile_failed:${err instanceof Error ? err.message : String(err)}`] }))
    ]);
    const output = { ...result, mistake_rules: rules };
    if (flag(args, '--json')) return console.log(JSON.stringify(output, null, 2));
    console.log(`SKS memory build: ${result.ok ? 'ok' : result.reason}`);
    for (const file of result.written) console.log(`- ${file}`);
    console.log(`- mistake rules compiled: ${rules.compiled.length}, skipped: ${rules.skipped.length}`);
    if (!result.ok) process.exitCode = 1;
    return output;
  }
  return gcCommand(args || []);
}

export async function gcCommand(args: any = []) {
  const root = await sksRoot();
  const action = String(args[0] || '').toLowerCase();
  if (action === 'plan') {
    const res = await enforceRetention(root, { dryRun: true, pruneReportLogs: true, policy: { max_tmp_age_hours: 0 } });
    if (flag(args, '--json')) return console.log(JSON.stringify(res.plan, null, 2));
    console.log('ㅅㅋㅅ GC plan');
    console.log(`Plan hash: ${res.plan.plan_hash}`);
    console.log(`Actions: ${res.actions.length}`);
    return res.plan;
  }
  if (action === 'apply') {
    if (!flag(args, '--yes')) {
      const blocked = { schema: 'sks.retention-apply.v1', ok: false, applied: false, blockers: ['gc_apply_requires_yes'] };
      if (flag(args, '--json')) return console.log(JSON.stringify(blocked, null, 2));
      console.log('ㅅㅋㅅ GC apply blocked: pass --yes after reviewing `sks gc plan --json`.');
      process.exitCode = 1;
      return blocked;
    }
    const res = await applyRetentionPlan(root, {
      pruneReportLogs: true,
      policy: { max_tmp_age_hours: 0 },
      planHash: readOption(args, '--plan-hash', null)
    });
    if (flag(args, '--json')) return console.log(JSON.stringify(res, null, 2));
    console.log(res.ok ? 'ㅅㅋㅅ GC applied' : 'ㅅㅋㅅ GC apply blocked');
    console.log(`Actions: ${res.action_count || 0}`);
    for (const blocker of res.blockers || []) console.log(`- ${blocker}`);
    if (!res.ok) process.exitCode = 1;
    return res;
  }
  if (action === 'status') {
    await refreshMissionIndex(root).catch(() => null);
    const res = await retentionStatus(root);
    if (flag(args, '--json')) return console.log(JSON.stringify(res, null, 2));
    console.log('ㅅㅋㅅ GC status');
    console.log(`Missions: ${res.mission_index?.mission_count ?? 'unknown'}`);
    console.log(`Latest plan: ${res.latest_plan?.plan_hash || 'none'}`);
    return res;
  }
  const res = await enforceRetention(root, { dryRun: flag(args, '--dry-run'), pruneReportLogs: true, policy: { max_tmp_age_hours: 0 } });
  if (flag(args, '--json')) return console.log(JSON.stringify(res, null, 2));
  console.log(flag(args, '--dry-run') ? 'ㅅㅋㅅ GC dry run' : 'ㅅㅋㅅ GC completed');
  console.log(`Storage: ${res.report.total_human || '0 B'}`);
  console.log(`Actions: ${res.actions.length}`);
  console.log(`Protected: ${res.cleanup.protected_durable_context.length} durable context classes`);
  for (const a of res.actions.slice(0, 20)) console.log(`- ${a.action} ${a.path || a.mission || ''} ${a.bytes ? formatBytes(a.bytes) : ''}`);
}

function readOption(args: any[] = [], name: string, fallback: unknown = null) {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !String(args[index + 1]).startsWith('--')) return args[index + 1];
  const prefixed = args.find((arg) => String(arg).startsWith(`${name}=`));
  return prefixed ? String(prefixed).slice(name.length + 1) : fallback;
}

export async function statsCommand(args: any = []) {
  const root = await sksRoot();
  const full = flag(args, '--full');
  const report = full ? await storageReport(root) : await lightweightStorageReport(root);
  const pkgBytes = full ? await dirSize(packageRoot()).catch(() => 0) : null;
  const out = {
    package: full
      ? { bytes: pkgBytes, human: formatBytes(pkgBytes), full_size: true }
      : { bytes: null, human: null, full_size: false, note: 'Run `sks stats --full --json` for recursive package sizing.' },
    storage: report
  };
  if (flag(args, '--json')) return console.log(JSON.stringify(out, null, 2));
  console.log('ㅅㅋㅅ Stats');
  console.log(`Package: ${out.package.human || 'not scanned (use --full)'}`);
  console.log(`State:   ${report.total_human || 'not scanned (use --full)'}`);
}
