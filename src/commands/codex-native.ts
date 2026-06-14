import { flag } from '../cli/args.js';
import { printJson } from '../cli/output.js';
import { sksRoot } from '../core/fsx.js';
import { syncCodexAgentRoles } from '../core/codex-app/codex-agent-role-sync.js';
import { resolveCodexAppExecutionProfile } from '../core/codex-app/codex-app-execution-profile.js';
import { buildCodexAppHarnessMatrix } from '../core/codex-app/codex-app-harness-matrix.js';
import { buildCodexHookLifecycle } from '../core/codex-app/codex-hook-lifecycle.js';
import { runCodexInitDeep } from '../core/codex-app/codex-init-deep.js';
import { syncCodexSksSkills } from '../core/codex-app/codex-skill-sync.js';
import { buildCodexNativeFeatureMatrix } from '../core/codex-native/codex-native-feature-broker.js';
import { resolveCodexNativeInvocationPlan } from '../core/codex-native/codex-native-invocation-router.js';
import { buildCodexNativeInteropPolicy } from '../core/codex-native/codex-native-interop-policy.js';
import { analyzeCodexNativeReferenceSource } from '../core/codex-native/codex-native-reference-evidence.js';
import { writeCodexNativePatternAnalysis } from '../core/codex-native/codex-native-pattern-analysis.js';

export async function run(_command: any, args: any = []) {
  const root = await sksRoot();
  const action = String(args[0] || 'status');
  if (action === 'status' || action === 'check' || action === 'feature-broker' || action === 'feature-matrix') {
    return printCodexNativeResult(args, await buildCodexNativeFeatureMatrix({ root, applyRepairs: flag(args, '--fix') || flag(args, '--apply') }));
  }
  if (action === 'harness-matrix' || action === 'harness-compat') {
    return printCodexNativeResult(args, await buildCodexAppHarnessMatrix({ root, applyRepairs: flag(args, '--fix') || flag(args, '--apply') }));
  }
  if (action === 'skill-sync') return printCodexNativeResult(args, await syncCodexSksSkills({ root, apply: flag(args, '--apply') || flag(args, '--fix') }));
  if (action === 'agent-role-sync') return printCodexNativeResult(args, await syncCodexAgentRoles({ root, apply: flag(args, '--apply') || flag(args, '--fix') }));
  if (action === 'init-deep') return printCodexNativeResult(args, await runCodexInitDeep({ root, apply: flag(args, '--apply') || flag(args, '--fix'), directoryLocal: flag(args, '--directory-local') }));
  if (action === 'hook-lifecycle') return printCodexNativeResult(args, await buildCodexHookLifecycle({ root, apply: flag(args, '--apply') || flag(args, '--fix') }));
  if (action === 'execution-profile') return printCodexNativeResult(args, await resolveCodexAppExecutionProfile({ root }));
  if (action === 'interop-policy') return printCodexNativeResult(args, await buildCodexNativeInteropPolicy({ root }));
  if (action === 'reference-evidence') return printCodexNativeResult(args, await analyzeCodexNativeReferenceSource({ root, writeReport: true }));
  if (action === 'pattern-analysis') return printCodexNativeResult(args, await writeCodexNativePatternAnalysis(root));
  if (action === 'route' || action === 'invocation-plan') {
    const route = readOption(args, '--route', '$Loop') as '$Loop' | '$QA-LOOP' | '$Research' | '$Image' | '$MAD' | '$Doctor';
    const desiredCapability = readOption(args, '--capability', 'agent-role') as any;
    const missionId = readOption(args, '--mission', null);
    return printCodexNativeResult(args, await resolveCodexNativeInvocationPlan({ root, missionId, route, desiredCapability }));
  }
  console.error('Usage: sks codex-native status|feature-broker|harness-compat|skill-sync|agent-role-sync|init-deep|hook-lifecycle|execution-profile|interop-policy|reference-evidence|pattern-analysis|invocation-plan [--json]');
  process.exitCode = 1;
}

function printCodexNativeResult(args: any[] = [], result: any) {
  if (flag(args, '--json')) {
    printJson(result);
    if (result?.ok === false) process.exitCode = 1;
    return;
  }
  console.log(`${result?.schema || 'sks.codex-native-result'}: ${result?.ok === false ? 'blocked' : 'ok'}`);
  for (const blocker of result?.blockers || []) console.log(`- blocker: ${blocker}`);
  for (const warning of result?.warnings || []) console.log(`- warning: ${warning}`);
  if (result?.ok === false) process.exitCode = 1;
}

function readOption(args: any[] = [], name: string, fallback: string | null): string | null {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? String(args[index + 1]) : fallback;
}
