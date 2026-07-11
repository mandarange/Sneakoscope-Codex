import { flag, readOption } from '../cli/args.js';
import { printJson } from '../cli/output.js';
import { codexCompatibilityReport, codexDoctorReport } from '../core/codex-compat/codex-compat-report.js';
import { codexVersionReport } from '../core/codex-compat/codex-version.js';
import { codexSchemaSnapshotReport } from '../core/codex-compat/codex-schema-snapshot.js';
import { detectCodex0141Capability } from '../core/codex-control/codex-0141-capability.js';
import { detectCodex0144Capability } from '../core/codex-control/codex-0144-capability.js';
import { CURRENT_CODEX_RELEASE_MANIFEST } from '../core/codex-compat/codex-release-manifest.js';

export async function run(_command: any, args: any = []) {
  const action = args[0] || 'compatibility';
  if (action === 'compatibility' || action === 'compat') {
    const requiredBaseline = readOption(args, '--require', null);
    const result = await codexCompatibilityReport({ requiredBaseline, require: requiredBaseline });
    if (flag(args, '--json')) return printJson(result);
    console.log(`Codex compatibility: ${result.ok ? result.status : 'blocked'} (${result.required_baseline})`);
    for (const warning of result.warnings || []) console.log(`- ${warning}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (action === 'version') {
    const result = await codexVersionReport();
    if (flag(args, '--json')) return printJson(result);
    console.log(`Codex detected: ${result.detected.version || 'not installed'} (${result.policy.status})`);
    return;
  }
  if (action === '0.141' || action === '0141' || action === 'rust-v0.141.0') {
    const result = await detectCodex0141Capability();
    if (flag(args, '--json')) return printJson(result);
    console.log(`Codex 0.141 compatibility: ${result.ok ? 'ok' : 'blocked'}`);
    for (const blocker of result.blockers || []) console.log(`- blocker: ${blocker}`);
    for (const warning of result.warnings || []) console.log(`- warning: ${warning}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (action === '0.144' || action === '0144' || action === CURRENT_CODEX_RELEASE_MANIFEST.targetTag) {
    const result = await detectCodex0144Capability({ requireReal: flag(args, '--require-real') });
    if (flag(args, '--json')) return printJson(result);
    console.log(`Codex ${CURRENT_CODEX_RELEASE_MANIFEST.requiredCliVersion} compatibility: ${result.ok ? 'ok' : 'blocked'} (${result.probe_mode})`);
    for (const blocker of result.blockers || []) console.log(`- blocker: ${blocker}`);
    for (const warning of result.warnings || []) console.log(`- warning: ${warning}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (action === 'doctor') {
    const result = await codexDoctorReport();
    if (flag(args, '--json')) return printJson(result);
    console.log(`Codex doctor: ${result.ok ? 'ok' : 'blocked'}`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (action === 'schema' || action === 'snapshot') {
    const result = await codexSchemaSnapshotReport();
    if (flag(args, '--json')) return printJson(result);
    console.log(`Codex hook schema snapshot: ${result.ok ? 'ok' : 'blocked'} (${result.baseline})`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  console.error('Usage: sks codex compatibility|version|doctor|schema|0.144|0.141 [--json]');
  process.exitCode = 1;
}
