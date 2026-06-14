import path from 'node:path'
import { nowIso, writeJsonAtomic, writeTextAtomic } from '../fsx.js'
import { analyzeLazyCodexLiveSource, type LazyCodexLiveAnalysis } from './lazycodex-live-analyzer.js'

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
    confidence: 'low' | 'medium' | 'high'
    live_evidence: string[]
  }>
  blockers: string[]
  warnings: string[]
  live_analysis_path: string | null
}

export function buildLazyCodexPatternAnalysis(live: LazyCodexLiveAnalysis | null = null): LazyCodexPatternAnalysis {
  const liveByPattern = new Map(live?.patterns.map((row) => [row.id, row]) || [])
  const liveEvidenceByPattern = new Map<string, string[]>()
  for (const row of live?.evidence || []) {
    const list = liveEvidenceByPattern.get(row.pattern_id) || []
    list.push(`${row.file}:${row.lines?.join('-') || 'unknown'}:${row.snippet_hash}`)
    liveEvidenceByPattern.set(row.pattern_id, list)
  }
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
    ].map((row) => {
      const livePattern = liveByPattern.get(row.id)
      const liveEvidence = liveEvidenceByPattern.get(row.id) || []
      return {
        ...row,
        evidence: [...row.evidence, ...liveEvidence],
        confidence: liveEvidence.length ? 'high' as const : livePattern ? 'medium' as const : 'low' as const,
        live_evidence: liveEvidence
      }
    }),
    blockers: live?.blockers || [],
    warnings: live?.warnings || (live ? [] : ['live_analysis_not_available_static_only']),
    live_analysis_path: live ? '.sneakoscope/reports/lazycodex-live-analysis.json' : null
  }
}

export async function writeLazyCodexPatternAnalysis(root: string): Promise<LazyCodexPatternAnalysis> {
  const live = await analyzeLazyCodexLiveSource({ root, writeReport: true }).catch(() => null)
  const report = buildLazyCodexPatternAnalysis(live)
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'lazycodex-analysis.json'), report)
  await writeTextAtomic(path.join(root, 'docs', 'lazycodex-analysis.md'), renderLazyCodexAnalysisMarkdown(report)).catch(() => undefined)
  return report
}

export function renderLazyCodexAnalysisMarkdown(report: LazyCodexPatternAnalysis): string {
  const rows = report.patterns.map((p) => `| ${p.id} | ${p.sks_adoption} | ${p.confidence} | ${p.live_evidence.length} | ${p.rationale.replace(/\|/g, '\\|')} |`).join('\n')
  return [
    '# LazyCodex / OmO Pattern Analysis',
    '',
    `Source repo: \`${report.source_repo}\``,
    `Analyzed at: \`${report.analyzed_at}\``,
    `Live analysis: \`${report.live_analysis_path || 'not available'}\``,
    '',
    '| Pattern | Adoption | Confidence | Live Evidence | Rationale |',
    '|---|---|---|---:|---|',
    rows,
    '',
    'This artifact combines static directive mapping with hashed current-source evidence when available. Long source excerpts are intentionally omitted.'
  ].join('\n')
}

function pattern(
  id: string,
  title: string,
  evidence: string[],
  sks_adoption: LazyCodexPatternAnalysis['patterns'][number]['sks_adoption'],
  rationale: string,
  target_modules: string[]
): Omit<LazyCodexPatternAnalysis['patterns'][number], 'confidence' | 'live_evidence'> {
  return { id, title, evidence, sks_adoption, rationale, target_modules }
}
