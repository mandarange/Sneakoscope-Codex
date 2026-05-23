import { runMadSksGuardMiddleware } from '../guard-middleware.js';
import { madSksAuditAction } from '../audit-ledger.js';
import { resultFromEvidence, type MadSksExecutor, type MadSksExecutorContext, type MadSksExecutorInput, writeExecutorEvidence } from './executor-base.js';

export const computerUseExecutor: MadSksExecutor = {
  id: 'computer-use',
  action_type: 'computer_use',
  async dryRun(input, context) {
    return runVisualHandoff(input, context, 'computer_use', true);
  },
  async apply(input, context) {
    return runVisualHandoff(input, context, 'computer_use', false);
  }
};

export const browserUseExecutor: MadSksExecutor = {
  id: 'browser-use',
  action_type: 'browser_use',
  async dryRun(input, context) {
    return runVisualHandoff(input, context, 'browser_use', true);
  },
  async apply(input, context) {
    return runVisualHandoff(input, context, 'browser_use', false);
  }
};

export const generatedAssetExecutor: MadSksExecutor = {
  id: 'generated-asset',
  action_type: 'generated_asset_edit',
  async dryRun(input, context) {
    return runVisualHandoff(input, context, 'generated_assets', true);
  },
  async apply(input, context) {
    return runVisualHandoff(input, context, 'generated_assets', false);
  }
};

async function runVisualHandoff(input: MadSksExecutorInput, context: MadSksExecutorContext, scope: 'computer_use' | 'browser_use' | 'generated_assets', dryRun: boolean) {
  const actionType = scope === 'browser_use' ? 'browser_use' : scope === 'generated_assets' ? 'generated_asset_edit' : 'computer_use';
  const guard = await runMadSksGuardMiddleware({
    input: { action_type: actionType, required_scope: scope, target_path: input.target_path || input.path || null, dry_run: dryRun, high_risk: scope !== 'generated_assets' },
    permission: context.permission_model,
    authorizationManifest: context.authorization_manifest,
    targetRoot: context.target_root,
    root: context.package_root
  });
  if (!guard.ok) {
    return resultFromEvidence({ executor: `${scope}-handoff`, actionType, context, status: 'blocked', blockedActions: [guard], blockers: guard.issues });
  }
  const verification = [{
    kind: `${scope}_handoff`,
    ok: true,
    local_only_evidence: true,
    target_boundary: context.target_root,
    ux_ppt_proof_graph_linked: scope === 'generated_assets' ? true : null,
    shared_triwiki_auto_publish: false
  }];
  const evidence = await writeExecutorEvidence({
    context,
    executor: `${scope}-handoff`,
    actionType,
    rollbackUnavailable: scope === 'generated_assets' ? [] : [`${scope}_external_state_rollback_requires_route_specific_adapter`],
    auditActions: [madSksAuditAction({ type: actionType, target: String(input.target_path || input.path || context.target_root), rollback_available: scope === 'generated_assets', risk_level: scope === 'generated_assets' ? 'medium' : 'high' })],
    verification
  });
  return resultFromEvidence({
    executor: `${scope}-handoff`,
    actionType,
    context,
    status: dryRun ? 'dry_run' : 'handoff_ready',
    evidence,
    verification,
    writesPerformed: false,
    extra: { guard, handoff: true, local_only_artifact_policy: true }
  });
}
