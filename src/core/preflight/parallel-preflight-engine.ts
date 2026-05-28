import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import { buildCodexExecArgs } from '../codex/codex-cli-syntax-builder.js'
import { inspectCodexConfigReadability } from '../codex/codex-config-readability.js'
import { repairCodexConfigEperm } from '../codex/codex-config-eperm-repair.js'
import { splitCodexProjectConfigPolicy } from '../codex/codex-project-config-policy.js'

export const PARALLEL_PREFLIGHT_SCHEMA = 'sks.parallel-preflight.v1'

export async function runParallelPreflight(checks: Array<{ id: string; run: () => Promise<any> }>) {
  const startedAt = nowIso()
  const settled = await Promise.allSettled(checks.map((check) => check.run()))
  const results = settled.map((result, index) => ({
    id: checks[index]?.id || `check_${index}`,
    ok: result.status === 'fulfilled' && result.value?.ok !== false,
    status: result.status,
    value: result.status === 'fulfilled' ? result.value : null,
    error: result.status === 'rejected' ? String(result.reason?.message || result.reason) : null
  }))
  return {
    schema: PARALLEL_PREFLIGHT_SCHEMA,
    generated_at: nowIso(),
    started_at: startedAt,
    ok: results.every((result) => result.ok),
    results,
    blockers: results.flatMap((result: any) => result.value?.blockers || (result.ok ? [] : [`${result.id}_failed`])),
    operator_actions: [...new Set(results.flatMap((result: any) => result.value?.operator_actions || []))]
  }
}

export async function runCodexLaunchPreflight(rootInput: string = process.cwd(), opts: any = {}) {
  const root = path.resolve(rootInput || process.cwd())
  const reportPath = opts.reportPath || path.join(root, '.sneakoscope', 'reports', 'mad-launch-preflight.json')
  const readonly = await runParallelPreflight([
    { id: 'codex_config_readability', run: () => inspectCodexConfigReadability(root, { ...opts, writeReport: false }) },
    { id: 'codex_project_config_policy', run: () => splitCodexProjectConfigPolicy(root, { ...opts, writeReport: false }) }
  ])
  const repair = opts.fix === true || readonly.ok === false
    ? await repairCodexConfigEperm(root, { ...opts, fix: opts.fix !== false, writeReport: false })
    : null
  const codexArgs = buildCodexExecArgs({
    json: true,
    outputLastMessage: path.join(root, '.sneakoscope', 'reports', 'codex-preflight-output.json'),
    ephemeral: true,
    skipGitRepoCheck: true,
    profile: opts.profile || null,
    ignoreUserConfig: !opts.profile,
    ignoreRules: true,
    sandbox: opts.sandbox || 'workspace-write',
    serviceTier: opts.serviceTier || 'fast',
    prompt: 'SKS Codex launch preflight syntax proof only.'
  })
  const fastTierProof = {
    schema: 'sks.codex-fast-tier-cli-proof.v1',
    ok: codexArgs.includes('-c') && codexArgs.includes(`service_tier=${opts.serviceTier || 'fast'}`),
    service_tier: opts.serviceTier || 'fast',
    codex_args: codexArgs
  }
  const blockers = [...new Set([...(readonly.blockers || []), ...(repair?.blockers || []), ...(fastTierProof.ok ? [] : ['service_tier_not_passed_to_codex'])])]
  const operatorActions = [...new Set([...(readonly.operator_actions || []), ...(repair?.operator_actions || [])])]
  const report = {
    schema: 'sks.mad-launch-preflight.v1',
    generated_at: nowIso(),
    root,
    ok: blockers.length === 0,
    readonly,
    repair,
    fast_tier_proof: fastTierProof,
    blockers,
    operator_actions: operatorActions
  }
  if (opts.writeReport !== false) await writeJsonAtomic(reportPath, { ...report, report_path: reportPath })
  return report
}
