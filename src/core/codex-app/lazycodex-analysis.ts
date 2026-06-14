// @ts-nocheck
import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'

export interface LazyCodexPatternAnalysis {
  schema: 'sks.lazycodex-pattern-analysis.v1'
  source_repo: 'code-yeongyu/lazycodex'
  analyzed_at: string
  patterns: Array<{
    id: string
    title: string
    evidence: string[]
    sks_adoption: 'adopt' | 'adapt' | 'reject' | 'watch'
    rationale: string
    target_modules: string[]
  }>
  blockers: string[]
}

export function buildLazyCodexPatternAnalysis(): LazyCodexPatternAnalysis {
  return {
    schema: 'sks.lazycodex-pattern-analysis.v1',
    source_repo: 'code-yeongyu/lazycodex',
    analyzed_at: nowIso(),
    patterns: [
      pattern('npx-no-global-install', 'npx no-global install alias', ['Directive: npx lazycodex-ai install aliases npx --yes --package oh-my-openagent omo install --platform=codex.'], 'adapt', 'Keep optional tooling no-global by default and record repair transactions.', ['src/cli/install-helpers.ts', 'src/core/zellij/zellij-self-heal.ts']),
      pattern('codex-marketplace-plugin', 'Codex marketplace plugin add/upgrade', ['Directive: codex plugin marketplace add and codex plugin add omo@sisyphuslabs.'], 'adapt', 'Track marketplace/plugin inventory without assuming hooks are approved.', ['src/core/codex-app/codex-app-harness-matrix.ts']),
      pattern('startup-review-hooks', 'Startup review hook approval', ['Directive: hooks require Codex startup review approval and re-approval after modifications.'], 'adopt', 'Separate installed hook files from approval state; unknown remains unknown.', ['src/core/codex-app/codex-hook-lifecycle.ts']),
      pattern('background-bootstrap', 'Background bootstrap and restart notice', ['Directive: first approved session performs background bootstrap and upgrade may require restart.'], 'adapt', 'Report bootstrap proof as warning/blocker instead of silently assuming completion.', ['src/core/codex-app/codex-app-harness-matrix.ts']),
      pattern('doctor-health-report', 'Doctor health report for plugin cache/hooks/MCP/agents/config', ['Directive: LazyCodex doctor reports plugin cache, hooks, MCP servers, agents, config state.'], 'adopt', 'Add Codex App Harness section to SKS doctor.', ['src/commands/doctor.ts']),
      pattern('dollar-skill-picker', '$ skill picker and $command invocation', ['Directive: Codex composer $ browses installed skills.'], 'adapt', 'Keep SKS route skills synced without clobbering user or LazyCodex skills.', ['src/core/codex-app/codex-skill-sync.ts']),
      pattern('init-deep-agents', '$init-deep hierarchical AGENTS.md', ['Directive: init-deep creates hierarchical AGENTS.md context.'], 'adapt', 'Generate SKS memory under .sneakoscope/context by default and preserve user AGENTS.md.', ['src/core/codex-app/codex-init-deep.ts']),
      pattern('plan-start-loop', '$ulw-plan, $start-work, $ulw-loop command pillars', ['Directive: separate planning, durable work, and evidence loop.'], 'adapt', 'Map onto sks loop plan/run/proof without replacing existing Loop Mesh.', ['src/core/commands/loop-command.ts']),
      pattern('specialist-skills', 'Specialist skills', ['Directive: specialist skills include review-work, LSP, AST-grep, programming, frontend UI/UX.'], 'watch', 'Keep checker profile selection explicit and evidence-backed.', ['src/core/loops/loop-gate-selector.ts']),
      pattern('native-agent-type', 'Native spawn_agent agent_type with message fallback', ['Directive: LazyCodex probes agent_type and falls back to role in message.'], 'adopt', 'Expose native agent_type capability in execution profile.', ['src/core/codex-app/codex-agent-role-sync.ts', 'src/core/codex-app/codex-app-execution-profile.ts']),
      pattern('multi-model-routing', 'Multi-model routing', ['Directive: LazyCodex/OmO route multiple models.'], 'watch', 'SKS keeps provider/profile policy separate from harness matrix.', ['src/core/provider/provider-context.ts']),
      pattern('hook-continuation', 'Hook lifecycle and continuation enforcer', ['Directive: UserPromptSubmit, PreToolUse, PostToolUse, Stop, Notification map to pipeline actions.'], 'adopt', 'Map lifecycle and add Loop continuation proof adapter.', ['src/core/codex-app/codex-hook-lifecycle.ts', 'src/core/loops/loop-continuation-enforcer.ts']),
      pattern('skill-mcp-slashcommand', 'Skill MCP and slashcommand tool', ['Directive: OmO exposes skill MCP and slashcommand tools.'], 'adapt', 'Report MCP candidates and SKS route skill availability without assuming external plugin behavior.', ['src/core/codex-app/codex-app-harness-matrix.ts']),
      pattern('lsp-ast-grep', 'LSP/AST-grep optional tooling', ['Directive: LSP/AST-grep are optional-but-first-class loop gates/tools.'], 'watch', 'Use as future specialist gates; do not add unrequested fallback tooling now.', ['src/core/loops/loop-gate-selector.ts'])
    ],
    blockers: []
  }
}

export async function writeLazyCodexPatternAnalysis(root: string): Promise<LazyCodexPatternAnalysis> {
  const report = buildLazyCodexPatternAnalysis()
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'lazycodex-analysis.json'), report)
  return report
}

export function renderLazyCodexAnalysisMarkdown(report: LazyCodexPatternAnalysis): string {
  const rows = report.patterns.map((p) => `| ${p.id} | ${p.sks_adoption} | ${p.rationale.replace(/\|/g, '\\|')} |`).join('\n')
  return [
    '# LazyCodex / OmO Pattern Analysis',
    '',
    `Source repo: \`${report.source_repo}\``,
    `Analyzed at: \`${report.analyzed_at}\``,
    '',
    '| Pattern | Adoption | Rationale |',
    '|---|---|---|',
    rows,
    '',
    'This artifact is deterministic and based on the SKS 3.1.4 directive plus current SKS repository surfaces. Live LazyCodex runtime behavior remains a separate verification concern.'
  ].join('\n')
}

function pattern(id: string, title: string, evidence: string[], sks_adoption: LazyCodexPatternAnalysis['patterns'][number]['sks_adoption'], rationale: string, target_modules: string[]) {
  return { id, title, evidence, sks_adoption, rationale, target_modules }
}
