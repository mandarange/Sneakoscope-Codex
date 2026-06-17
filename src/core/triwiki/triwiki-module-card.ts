export const TRIWIKI_MODULE_CARD_SCHEMA = 'sks.triwiki-module-card.v1';

export interface TriWikiModuleCard {
  schema: typeof TRIWIKI_MODULE_CARD_SCHEMA;
  module_id: string;
  paths: string[];
  owns_gate_prefixes: string[];
  gate_packs: string[];
  risk: 'low' | 'medium' | 'high';
}

export const DEFAULT_TRIWIKI_MODULE_CARDS: TriWikiModuleCard[] = [
  moduleCard('triwiki', ['src/core/triwiki/**', 'src/scripts/triwiki-*.ts'], ['triwiki:'], ['triwiki'], 'high'),
  moduleCard('release', ['src/core/release/**', 'release-gates.v2.json', 'src/scripts/release-*.ts'], ['release:', 'gate-pack:', 'scheduler:', 'certificate:'], ['release-parity'], 'high'),
  moduleCard('build', ['src/core/build/**', 'src/scripts/build-once-*.ts', 'tsconfig.json'], ['build-once:'], ['doctor-production'], 'medium'),
  moduleCard('daemon', ['src/core/daemon/**', 'src/core/probes/**', 'src/scripts/sksd-*.ts', 'src/scripts/probe-*.ts'], ['sksd:', 'probes:'], ['startup-mcp'], 'medium'),
  moduleCard('doctor', ['src/core/doctor/**', 'src/commands/doctor.ts', 'src/scripts/doctor-*.ts'], ['doctor:'], ['doctor-production'], 'high'),
  moduleCard('legacy', ['src/scripts/legacy-*.ts', 'src/scripts/orphan-*.ts', 'src/commands/tmux.ts'], ['legacy:', 'orphan:'], ['zellij'], 'medium'),
  moduleCard('cli', ['src/cli/**', 'src/core/commands/**', 'src/commands/**'], ['cli:', 'sks:'], ['native-capability'], 'high'),
  moduleCard('codex', ['src/core/codex*/**', 'src/scripts/codex-*.ts'], ['codex:', 'pipeline:codex'], ['codex-0140'], 'medium'),
  moduleCard('skills', ['.agents/skills/**', 'src/core/skills/**', 'src/scripts/skill-*.ts', 'src/scripts/core-skill-*.ts'], ['skill:', 'core-skill:'], ['core-skill', 'skill-dedupe'], 'medium'),
  moduleCard('qa-research-image', ['src/core/qa/**', 'src/core/research/**', 'src/core/image/**', 'src/scripts/qa-*.ts', 'src/scripts/research-*.ts', 'src/scripts/image-*.ts'], ['qa-', 'research:', 'image:'], ['qa-research-image'], 'medium')
];

export function moduleCard(moduleId: string, paths: string[], ownsGatePrefixes: string[], gatePacks: string[], risk: TriWikiModuleCard['risk']): TriWikiModuleCard {
  return {
    schema: TRIWIKI_MODULE_CARD_SCHEMA,
    module_id: moduleId,
    paths,
    owns_gate_prefixes: ownsGatePrefixes,
    gate_packs: gatePacks,
    risk
  };
}

export function moduleIdsForPath(file: string, cards: TriWikiModuleCard[] = DEFAULT_TRIWIKI_MODULE_CARDS): string[] {
  const normalized = file.replace(/\\/g, '/');
  const matches = cards.filter((card) => card.paths.some((pattern) => pathMatches(pattern, normalized))).map((card) => card.module_id);
  return matches.length ? matches : ['unknown'];
}

export function pathMatches(pattern: string, file: string): boolean {
  if (pattern.endsWith('/**')) return file === pattern.slice(0, -3) || file.startsWith(pattern.slice(0, -2));
  if (!pattern.includes('*')) return file === pattern || file.startsWith(`${pattern}/`);
  const re = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*\\\*/g, '.*').replace(/\\\*/g, '[^/]*')}$`);
  return re.test(file);
}
