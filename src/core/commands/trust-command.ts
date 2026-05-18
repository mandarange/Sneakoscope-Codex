// @ts-nocheck
import { projectRoot } from '../fsx.js';
import { latestTrustReport } from '../trust-kernel/trust-report.js';
import { flag, positionalArgs } from './command-utils.js';

export async function trustCommand(args = []) {
  const action = args[0] || 'status';
  const rest = args.slice(1);
  const root = await projectRoot();
  if (action === 'report' || action === 'validate' || action === 'status' || action === 'explain') {
    const mission = positionalArgs(rest)[0] || 'latest';
    const report = await latestTrustReport(root, mission);
    if (action === 'validate' && report.status === 'verified_partial' && flag(args, '--strict')) {
      report.ok = false;
      report.issues = [...(report.issues || []), 'strict_requires_verified'];
    }
    if (flag(args, '--json')) {
      console.log(JSON.stringify(action === 'validate'
        ? { schema: 'sks.trust-validation.v1', ok: report.ok, status: report.status, issues: report.issues || [], report }
        : report, null, 2));
    } else if (action === 'explain') {
      printExplain(report);
    } else {
      console.log(`Trust ${action}: ${report.status || 'not_verified'} ${report.ok ? 'ok' : 'blocked'}`);
      for (const issue of report.issues || []) console.log(`- ${issue}`);
    }
    if (action === 'validate' && !report.ok) process.exitCode = 1;
    return report;
  }
  console.error('Usage: sks trust report|validate|status|explain [latest|mission-id] [--json] [--strict]');
  process.exitCode = 2;
}

function printExplain(report = {}) {
  console.log('SKS Trust Kernel');
  console.log(`Mission: ${report.mission_id || 'none'}`);
  console.log(`Route:   ${report.route || 'unknown'}`);
  console.log(`Status:  ${report.status || 'not_verified'}`);
  console.log(`Proof:   ${report.proof_status || 'not_verified'}`);
  console.log(`Evidence:${report.evidence_status || 'not_verified'}`);
  for (const state of report.route_state_machine || []) {
    console.log(`- ${state.ok ? 'ok' : 'blocked'} ${state.state}`);
  }
  if (report.issues?.length) {
    console.log('Issues:');
    for (const issue of report.issues) console.log(`- ${issue}`);
  }
}
