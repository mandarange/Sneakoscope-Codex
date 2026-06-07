import path from 'node:path'
import { nowIso, runProcess } from '../fsx.js'
import { type CodexControlBackend } from '../codex-control/codex-control-plane.js'
import { defaultImplementationBlueprint } from './implementation-blueprint.js'

export async function densifyImplementationBlueprint(input: {
  root: string
  dir: string
  plan: any
  claimMatrix: any
  sourceLedger: any
  existingBlueprint: any
  backend: Exclude<CodexControlBackend, 'fake'> | 'deterministic'
}): Promise<any> {
  const fileMap = await repositoryFileMap(input.root)
  const likelyFiles = likelyTargetFiles(fileMap, input.plan, input.claimMatrix)
  const possibleNewFiles = possibleNewResearchFiles(fileMap)
  const base = input.existingBlueprint || defaultImplementationBlueprint(input.plan)
  const claims = Array.isArray(input.claimMatrix?.claims) ? input.claimMatrix.claims : []
  const keyClaimIds = Array.isArray(input.claimMatrix?.key_claim_ids) ? input.claimMatrix.key_claim_ids : claims.slice(0, 8).map((claim: any) => claim.id)
  const sections = [
    section('problem', 'Problem', `Research currently must prove it executes stage-aware source shard runtime instead of relying on summary-style final.md output. The handoff should preserve ${keyClaimIds.length} key claim ids and all source-ledger evidence before code work begins.`, keyClaimIds, likelyFiles.slice(0, 8), ['Confirm the follow-up route reads claim-evidence-matrix.json and source-ledger.json before implementation.']),
    section('decision', 'Decision', 'Use a dependency-aware research cycle with source_shard, source_merge, claim_matrix_build, falsification, implementation_blueprint, experiment_plan, synthesis, final_review, and verification stages. Keep Research read-only against repository source and write only mission artifacts.', keyClaimIds, likelyFiles.slice(0, 8), ['Default research run calls runResearchCycle; legacy final.md loop is opt-in only.']),
    section('architecture', 'Architecture', 'The runtime is split into source shard generation, source-ledger merge, claim builder, blueprint densifier, final reviewer, blackbox scripts, and CLI status output. Each stage writes a ResearchStageResult under research/cycle-N/stages.', keyClaimIds, likelyFiles, ['Stage result artifacts list concrete output_artifacts for every passed stage.']),
    section('interfaces', 'API And Schema Changes', `Existing files should expose typed contracts for shard outputs, stage results, merged source ledgers, Codex final review outputs, and concrete blueprint fields. Possible new files: ${possibleNewFiles.join(', ')}.`, keyClaimIds, likelyFiles, ['Schemas exist for research-source-shard and research-final-review.']),
    section('data_contracts', 'Data Contracts', 'Source rows must preserve id, layer, kind, title, locator, publisher_or_author, accessed_at, reliability, credibility, stance, and claim_ids. Claim rows must preserve source_ids, counterevidence_ids, triangulation layers, confidence, and test_or_probe.', keyClaimIds, ['schemas/research/research-source-shard.schema.json', 'schemas/research/claim-evidence-matrix.schema.json'], ['Source quality report returns ok only when source metadata and citation coverage are complete.']),
    section('execution_plan', 'Step By Step Implementation', implementationSteps(likelyFiles, possibleNewFiles).join('\n'), keyClaimIds, likelyFiles, ['Run research stage runtime blackbox, short-report rejection, complete-package fixture, and codex-sdk research pipeline gates.']),
    section('verification_plan', 'Verification Plan', 'Run the release truth, research quality, source shard, source merge, claim builder, blueprint densifier, final reviewer, codex-sdk research pipeline, release DAG, and release check commands listed in the directive.', keyClaimIds, ['package.json', 'release-gates.v2.json', 'src/scripts/release-dag-full-coverage-check.ts'], ['All directive final checklist commands either pass or have a documented blocker.']),
    section('risks_and_rollbacks', 'Risks And Rollbacks', 'The main risk is accepting deterministic fixture text as public-ready proof. Roll back by disabling new release gates only if the gate itself is wrong, not if implementation is incomplete. Research must block when live Codex/GPT final review is unavailable outside mock fixtures.', keyClaimIds, likelyFiles, ['A rollback keeps source mutation outside Research and restores package version metadata consistently.'])
  ]
  return {
    ...base,
    schema: 'sks.research-implementation-blueprint.v1',
    generated_at: nowIso(),
    prompt: input.plan?.prompt || base.prompt || '',
    implementation_allowed_in_research: false,
    handoff_route: '$Team',
    repository_aware: true,
    existing_files: likelyFiles,
    possible_new_files: possibleNewFiles,
    api_schema_changes: [
      'ResearchStageResult contract for every executed stage.',
      'ResearchSourceShardOutput contract for source layer partials.',
      'Codex/GPT final reviewer merged with static review.'
    ],
    test_commands: [
      'npm run research:stage-cycle-runtime-blackbox',
      'npm run research:short-report-rejection',
      'npm run research:complete-package-fixture',
      'npm run codex-sdk:research-pipeline',
      'npm run release:check'
    ],
    rollback_steps: [
      'Revert only the files listed in the follow-up patch plan.',
      'Restore package version metadata with npm install --package-lock-only if package-lock drift occurs.',
      'Run npm run release:version-truth and the research blackbox gates after rollback.'
    ],
    parallel_work_decomposition: [
      'WS-A stage runtime and research run integration.',
      'WS-B source shards and ledger merge.',
      'WS-C claim matrix builder.',
      'WS-D blueprint and handoff densifier.',
      'WS-E final reviewer.',
      'WS-F blackbox gates and release DAG.',
      'WS-G CLI/docs.',
      'WS-H integration and verification.'
    ],
    sections,
    dependencies: ['claim-evidence-matrix.json', 'source-ledger.json', 'falsification-ledger.json'],
    out_of_scope: ['Repository source mutation during $Research runs.'],
    open_questions: []
  }
}

async function repositoryFileMap(root: string): Promise<string[]> {
  const result = await runProcess('git', ['ls-files'], { cwd: root, timeoutMs: 15000, maxOutputBytes: 2 * 1024 * 1024 }).catch(() => ({ code: 1, stdout: '' }))
  return String(result.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

function likelyTargetFiles(files: string[], plan: any, claimMatrix: any): string[] {
  const promptTerms = new Set(String(plan?.prompt || '').toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 3))
  const guidanceTerms = new Set<string>((Array.isArray(claimMatrix?.claims) ? claimMatrix.claims : []).flatMap((claim: any) => String(claim?.claim || '').toLowerCase().split(/[^a-z0-9]+/)).filter((term: string) => term.length > 5))
  const preferred = [
    'src/core/research/research-cycle-runner.ts',
    'src/core/research/research-stage-runner.ts',
    'src/core/research/research-work-graph.ts',
    'src/core/commands/research-command.ts',
    'src/core/research/claim-evidence-matrix.ts',
    'src/core/research/implementation-blueprint.ts',
    'src/core/research/research-final-reviewer.ts',
    'package.json',
    'release-gates.v2.json',
    'docs/research-pipeline.md',
    'docs/research-artifacts.md',
    'docs/research-implementation-handoff.md'
  ].filter((file) => files.includes(file))
  const matched = files.filter((file) => {
    const lower = file.toLowerCase()
    return lower.includes('research') || [...promptTerms, ...guidanceTerms].some((term: string) => lower.includes(term))
  }).slice(0, 30)
  return [...new Set([...preferred, ...matched])].slice(0, 40)
}

function possibleNewResearchFiles(files: string[]): string[] {
  return [
    'src/core/research/research-source-shards.ts',
    'src/core/research/research-source-ledger-merge.ts',
    'src/core/research/research-claim-builder.ts',
    'src/core/research/implementation-blueprint-densifier.ts',
    'src/scripts/research-stage-cycle-runtime-blackbox.ts',
    'src/scripts/research-short-report-rejection-check.ts',
    'schemas/research/research-source-shard.schema.json'
  ].filter((file) => !files.includes(file))
}

function section(id: string, title: string, detail: string, claimIds: string[], targetPaths: string[], acceptanceChecks: string[]) {
  return {
    id,
    title,
    order: ['problem', 'decision', 'architecture', 'interfaces', 'data_contracts', 'execution_plan', 'verification_plan', 'risks_and_rollbacks'].indexOf(id) + 1,
    detail,
    evidence_claim_ids: claimIds.slice(0, 8),
    target_paths: targetPaths,
    acceptance_checks: acceptanceChecks
  }
}

function implementationSteps(existingFiles: string[], newFiles: string[]): string[] {
  return [
    `1. Update runtime files: ${existingFiles.filter((file) => file.includes('research-cycle-runner') || file.includes('research-stage-runner') || file.includes('research-work-graph')).join(', ')}.`,
    `2. Add or verify source/claim/blueprint helper files: ${newFiles.filter((file) => file.includes('research')).join(', ')}.`,
    '3. Wire sks research run so default execution uses runResearchCycle and the final.md Codex exec loop is legacy-only.',
    '4. Add blackbox scripts that create temporary missions and verify rejection/pass/runtime behavior.',
    '5. Update package scripts, release-gates.v2.json, docs, changelog, and version metadata.',
    '6. Run the directive final checklist and record any hard blocker instead of claiming completion.'
  ]
}
