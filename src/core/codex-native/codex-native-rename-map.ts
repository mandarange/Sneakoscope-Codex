export interface CodexNativeRenameRule {
  from_hash: string
  to: string
  surface: 'module' | 'gate' | 'schema' | 'artifact' | 'docs' | 'script'
}

export const CODEX_NATIVE_RENAME_RULES: CodexNativeRenameRule[] = [
  { from_hash: 'external-analysis', to: 'codex-native:pattern-analysis', surface: 'gate' },
  { from_hash: 'external-evidence', to: 'codex-native:reference-evidence', surface: 'gate' },
  { from_hash: 'external-interop', to: 'codex-native:interop-policy', surface: 'gate' },
  { from_hash: 'app-harness', to: 'codex-native:harness-matrix', surface: 'gate' },
  { from_hash: 'skill-sync', to: 'codex-native:skill-sync', surface: 'gate' },
  { from_hash: 'agent-role-sync', to: 'codex-native:agent-role-sync', surface: 'gate' },
  { from_hash: 'hook-lifecycle', to: 'codex-native:hook-lifecycle', surface: 'gate' },
  { from_hash: 'execution-profile', to: 'codex-native:execution-profile', surface: 'gate' },
  { from_hash: 'feature-broker', to: 'codex-native:feature-broker', surface: 'gate' },
  { from_hash: 'invocation-router', to: 'codex-native:invocation-router', surface: 'gate' },
  { from_hash: 'pattern-schema', to: 'sks.codex-native-pattern-analysis.v1', surface: 'schema' },
  { from_hash: 'evidence-schema', to: 'sks.codex-native-reference-evidence.v1', surface: 'schema' },
  { from_hash: 'matrix-schema', to: 'sks.codex-native-feature-matrix.v1', surface: 'schema' },
  { from_hash: 'plan-schema', to: 'sks.codex-native-invocation-plan.v1', surface: 'schema' },
  { from_hash: 'pattern-report', to: '.sneakoscope/reports/codex-native-pattern-analysis.json', surface: 'artifact' },
  { from_hash: 'evidence-report', to: '.sneakoscope/reports/codex-native-reference-evidence.json', surface: 'artifact' },
  { from_hash: 'matrix-report', to: '.sneakoscope/reports/codex-native-feature-matrix.json', surface: 'artifact' },
  { from_hash: 'plan-report', to: '.sneakoscope/reports/codex-native-invocation-plan.json', surface: 'artifact' },
  { from_hash: 'patterns-doc', to: 'docs/codex-native-patterns.md', surface: 'docs' }
]

export function codexNativeRenameTargets(): string[] {
  return CODEX_NATIVE_RENAME_RULES.map((rule) => rule.to)
}
