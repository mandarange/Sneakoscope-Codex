import { writeJsonAtomic } from '../fsx.js';
import { decomposeRequestIntoLoopDomains } from './loop-decomposer.js';
import { loopPlanPath, loopRunLogPath, loopStatePath } from './loop-artifacts.js';
import { selectLoopGates } from './loop-gate-selector.js';
import { inferLoopOwnerScope } from './loop-owner-inference.js';
import { classifyLoopRisk } from './loop-risk-classifier.js';
import { defaultLoopBudget, validateLoopPlan, type SksLoopNode, type SksLoopPlan } from './loop-schema.js';

export async function planLoopsFromRequest(input: {
  root: string;
  missionId: string;
  request: string;
  sourceCommand: 'goal' | 'loop' | 'naruto' | 'qa-loop' | 'research';
  mode?: 'deterministic' | 'codex-assisted';
  maxLoops?: number;
}): Promise<SksLoopPlan> {
  const maxLoops = Math.max(1, Math.min(32, input.maxLoops || 8));
  const domains = decomposeRequestIntoLoopDomains(input.request).slice(0, maxLoops);
  const actionNodes = domains.map((domain): SksLoopNode => {
    const loopId = `loop-${domain.id}`;
    const ownerScope = inferLoopOwnerScope({ domain });
    const risk = classifyLoopRisk({ loop_id: loopId, owner_scope: ownerScope, level: 'L2-action' });
    const nodeBase = makeNode({
      missionId: input.missionId,
      loopId,
      title: titleFromDomain(domain.id),
      purpose: `Execute ${domain.id} slice for: ${input.request}`,
      ownerScope,
      dependencies: [],
      route: domain.id === 'docs' ? '$Loop' : '$Naruto',
      level: domain.id === 'docs' ? 'L1-assisted' : 'L2-action',
      risk
    });
    return { ...nodeBase, gates: selectLoopGates({ node: nodeBase, changedFiles: [...ownerScope.files, ...ownerScope.directories], risk }) };
  });
  const integrationOwner = inferLoopOwnerScope({ domain: { id: 'integration', dirs: [], files: [], gates: ['release:dag-full-coverage'] }, integration: true });
  const integrationRisk = classifyLoopRisk({ loop_id: 'loop-integration', owner_scope: integrationOwner, level: 'L1-assisted' });
  const integrationBase = makeNode({
    missionId: input.missionId,
    loopId: 'loop-integration',
    title: 'Integration loop finalizer',
    purpose: 'Merge loop proofs, run integration gates, and require GPT final arbitration when source mutation exists.',
    ownerScope: integrationOwner,
    dependencies: actionNodes.map((node) => node.loop_id),
    route: '$Integration',
    level: 'L1-assisted',
    risk: integrationRisk
  });
  const integrationNode = {
    ...integrationBase,
    gates: selectLoopGates({
      node: integrationBase,
      changedFiles: ['package.json', 'release-gates.v2.json', 'CHANGELOG.md'],
      risk: integrationRisk,
      packageScriptsChanged: ['loop:runtime'],
      releaseGateIdsChanged: ['release:dag-full-coverage']
    })
  };
  const nodes = [...actionNodes, integrationNode];
  const plan: SksLoopPlan = {
    schema: 'sks.loop-plan.v1',
    mission_id: input.missionId,
    request: input.request,
    generated_at: new Date().toISOString(),
    planner: {
      route: '$Loop',
      model_policy: input.mode === 'codex-assisted' ? 'codex-sdk' : 'deterministic',
      confidence: actionNodes.length ? 'high' : 'medium'
    },
    graph: {
      nodes,
      edges: actionNodes.map((node) => ({ from: node.loop_id, to: integrationNode.loop_id, reason: 'integration_after_loop_proof' }))
    },
    global_budget: defaultLoopBudget({
      max_iterations: Math.max(...nodes.map((node) => node.budget.max_iterations)),
      max_subagents: nodes.reduce((sum, node) => sum + node.budget.max_subagents, 0)
    }),
    safety: {
      no_unrequested_fallback_code: true,
      require_owner_lease: true,
      require_checker_for_action: true,
      require_gpt_final_for_source_mutation: true
    },
    integration_loop_id: integrationNode.loop_id,
    compatibility: {
      goal_compat_artifact: input.sourceCommand === 'goal' ? `.sneakoscope/missions/${input.missionId}/goal-compat.json` : null,
      source_command: input.sourceCommand
    },
    blockers: []
  };
  const validation = validateLoopPlan(plan);
  plan.blockers = validation.blockers;
  await writeJsonAtomic(loopPlanPath(input.root, input.missionId), plan);
  return plan;
}

function makeNode(input: {
  missionId: string;
  loopId: string;
  title: string;
  purpose: string;
  ownerScope: SksLoopNode['owner_scope'];
  dependencies: string[];
  route: SksLoopNode['route'];
  level: SksLoopNode['level'];
  risk: SksLoopNode['risk'];
}): SksLoopNode {
  const budget = defaultLoopBudget({
    max_subagents: input.route === '$Integration' ? 2 : 4,
    max_changed_files: input.ownerScope.files.length ? Math.max(4, input.ownerScope.files.length + 2) : 12
  });
  return {
    schema: 'sks.loop-node.v1',
    loop_id: input.loopId,
    mission_id: input.missionId,
    title: input.title,
    purpose: input.purpose,
    level: input.level,
    route: input.route,
    owner_scope: input.ownerScope,
    state_file: loopStatePath('', input.missionId, input.loopId).replace(/^\/?/, ''),
    run_log_file: loopRunLogPath('', input.missionId, input.loopId).replace(/^\/?/, ''),
    budget,
    maker: {
      route: '$Naruto',
      role: input.route === '$Integration' ? 'planner' : input.loopId.includes('docs') ? 'writer' : 'implementer',
      worker_count: input.route === '$Integration' ? 1 : 2,
      backend_preference: ['codex-sdk', 'python-codex-sdk', 'local-llm'],
      local_draft_allowed: input.risk.level !== 'critical',
      gpt_final_required: input.risk.requires_gpt_final
    },
    checker: {
      route: input.loopId.includes('research') ? '$Research' : input.loopId.includes('docs') ? '$DFix' : '$QA-LOOP',
      worker_count: input.route === '$Integration' ? 1 : 1,
      fresh_session_required: true,
      stronger_model_required: input.risk.level === 'high' || input.risk.level === 'critical',
      required_before_next_iteration: input.level === 'L2-action'
    },
    gates: { triage: [], local: [], checker: [], integration: [], final: [] },
    dependencies: input.dependencies,
    handoff_policy: {
      allow_handoff: true,
      reasons: input.risk.requires_human_handoff ? ['critical_risk_requires_handoff'] : [],
      artifact: null
    },
    worktree: {
      required: input.risk.requires_worktree,
      mode: input.risk.requires_worktree ? 'new-worktree' : 'none',
      branch_prefix: `sks/loop/${input.missionId}`,
      cleanup: input.risk.level === 'low' ? 'on-success' : 'keep-on-failure'
    },
    risk: input.risk
  };
}

function titleFromDomain(domainId: string): string {
  return domainId === 'loop-general-coding' ? 'General coding loop' : `${domainId} loop`;
}
