import { PACKAGE_VERSION, nowIso, sha256 } from '../fsx.js';
import { canonicalSkillName } from './skill-name-canonicalizer.js';

export type SksCoreSkillRoute =
  | '$Loop'
  | '$Naruto'
  | '$QA-LOOP'
  | '$Research'
  | '$DFix'
  | '$Image-UX-Review'
  | '$Computer-Use'
  | '$Init-Deep';

export interface SksCoreSkillTemplate {
  id: string;
  canonical_name: string;
  display_name: string;
  route: SksCoreSkillRoute;
  relative_path: string;
  template_version: string;
  content_sha256: string;
  mutable_by_doctor: false;
  mutable_by_update: false;
  mutable_by_setup: false;
}

export interface SksCoreSkillManifest {
  schema: 'sks.core-skill-manifest.v1';
  generated_at: string;
  package_version: string;
  skills: SksCoreSkillTemplate[];
}

export const CORE_SKILL_TEMPLATE_VERSION = 'sks-core-skill-template.v1';
export const CORE_SKILL_MANAGED_BEGIN = '<!-- BEGIN SKS IMMUTABLE CORE SKILL -->';
export const CORE_SKILL_MANAGED_END = '<!-- END SKS IMMUTABLE CORE SKILL -->';

const CORE_SKILL_DEFINITIONS: Array<{
  id: string;
  canonical_name: string;
  display_name: string;
  route: SksCoreSkillRoute;
  purpose: string;
  when: string;
  evidence: string;
  fallback: string;
}> = [
  {
    id: 'sks-core-loop',
    canonical_name: 'loop',
    display_name: 'loop',
    route: '$Loop',
    purpose: 'compile persisted route work into bounded loop plans with continuation evidence.',
    when: 'Use for resumable route stages, memory hints, and loop mission artifacts.',
    evidence: '.sneakoscope/loops/** plus route-local proof artifacts.',
    fallback: 'Record the unavailable surface as blocked; do not fabricate a loop proof.'
  },
  {
    id: 'sks-core-naruto',
    canonical_name: 'naruto',
    display_name: 'naruto',
    route: '$Naruto',
    purpose: 'fan out bounded native worker lanes while parent integration remains owner.',
    when: 'Use when the selected route explicitly requires high-scale parallel review or implementation.',
    evidence: 'agent task graph, worker ledgers, leases, proof evidence, and cleanup artifacts.',
    fallback: 'Degrade to parent-owned execution with blockers recorded if native lanes are unavailable.'
  },
  {
    id: 'sks-core-qa-loop',
    canonical_name: 'qa-loop',
    display_name: 'qa-loop',
    route: '$QA-LOOP',
    purpose: 'dogfood UI/API behavior with safety gates and QA reports.',
    when: 'Use when route completion needs human-proxy verification, rechecks, and QA ledgers.',
    evidence: 'qa-ledger.json, dated QA report, qa-gate.json, and post-fix verification.',
    fallback: 'Mark unverified browser/native surfaces explicitly; never substitute fake visual evidence.'
  },
  {
    id: 'sks-core-research',
    canonical_name: 'research',
    display_name: 'research',
    route: '$Research',
    purpose: 'run evidence-bound discovery, source ledgers, and synthesis cycles.',
    when: 'Use for discovery, evaluation, external-source claims, or frontier-style research.',
    evidence: 'research plan, source ledger, cycle record, synthesis, and final review.',
    fallback: 'State source/tool unavailability and avoid unsupported live-accuracy claims.'
  },
  {
    id: 'sks-core-dfix',
    canonical_name: 'dfix',
    display_name: 'dfix',
    route: '$DFix',
    purpose: 'perform tiny direct fixes with cheap verification.',
    when: 'Use only for narrow copy/config/docs/labels/spacing/translation/mechanical edits.',
    evidence: 'focused diff and DFix Honest check.',
    fallback: 'Escalate broad implementation to a full execution route.'
  },
  {
    id: 'sks-core-image-ux-review',
    canonical_name: 'image-ux-review',
    display_name: 'image-ux-review',
    route: '$Image-UX-Review',
    purpose: 'produce generated annotated UI review images and extract issue ledgers.',
    when: 'Use for screenshot/UI UX review requests that require generated raster evidence.',
    evidence: 'source inventory, generated annotation image ledger, issue ledger, iteration report.',
    fallback: 'Block full verification if generated annotated images cannot be produced.'
  },
  {
    id: 'sks-core-computer-use',
    canonical_name: 'computer-use',
    display_name: 'computer-use',
    route: '$Computer-Use',
    purpose: 'operate native macOS desktop apps through Codex Computer Use.',
    when: 'Use only for native Mac/non-web app or OS-setting surfaces.',
    evidence: 'native desktop interaction evidence where live Computer Use is available.',
    fallback: 'Do not use Computer Use as browser/web evidence; mark unavailable surfaces unverified.'
  },
  {
    id: 'sks-core-init-deep',
    canonical_name: 'init-deep',
    display_name: 'init-deep',
    route: '$Init-Deep',
    purpose: 'refresh project-local memory, directory rules, and loop memory hints.',
    when: 'Use when deeper local context or directory-specific recall is required.',
    evidence: '.sneakoscope/context/AGENTS.generated.md and managed memory artifacts.',
    fallback: 'Preserve user content and skip directories that cannot be safely updated.'
  }
];

export function coreSkillDefinitions(): ReadonlyArray<typeof CORE_SKILL_DEFINITIONS[number]> {
  return CORE_SKILL_DEFINITIONS;
}

export function isCoreSkillName(name: string): boolean {
  const canonical = canonicalSkillName(name);
  return CORE_SKILL_DEFINITIONS.some((skill) => skill.canonical_name === canonical);
}

export function renderCoreSkillTemplate(name: string): string {
  const canonical = canonicalSkillName(name);
  const skill = CORE_SKILL_DEFINITIONS.find((entry) => entry.canonical_name === canonical);
  if (!skill) throw new Error(`Unknown SKS core skill: ${name}`);
  return [
    '---',
    `name: ${skill.display_name}`,
    `description: Immutable SKS core Codex App route bridge for ${skill.route}.`,
    '---',
    '',
    CORE_SKILL_MANAGED_BEGIN,
    `id: ${skill.id}`,
    `canonical_name: ${skill.canonical_name}`,
    `route: ${skill.route}`,
    `template_version: ${CORE_SKILL_TEMPLATE_VERSION}`,
    'mutable_by_doctor: false',
    'mutable_by_update: false',
    'mutable_by_setup: false',
    CORE_SKILL_MANAGED_END,
    '',
    `Route: ${skill.route}`,
    `Command: ${skill.route}`,
    `Purpose: ${skill.purpose}`,
    `Use when: ${skill.when}`,
    `Proof paths: ${skill.evidence}`,
    'Safety rules: preserve user-authored skills, keep route state bounded, and stop on hard blockers instead of fabricating fallback behavior.',
    `Failure recovery: ${skill.fallback}`,
    ''
  ].join('\n');
}

export function buildSksCoreSkillManifest(generatedAt: string = nowIso()): SksCoreSkillManifest {
  return {
    schema: 'sks.core-skill-manifest.v1',
    generated_at: generatedAt,
    package_version: PACKAGE_VERSION,
    skills: CORE_SKILL_DEFINITIONS.map((skill) => {
      const content = renderCoreSkillTemplate(skill.canonical_name);
      return {
        id: skill.id,
        canonical_name: skill.canonical_name,
        display_name: skill.display_name,
        route: skill.route,
        relative_path: `.agents/skills/${skill.canonical_name}/SKILL.md`,
        template_version: CORE_SKILL_TEMPLATE_VERSION,
        content_sha256: sha256(content),
        mutable_by_doctor: false,
        mutable_by_update: false,
        mutable_by_setup: false
      };
    })
  };
}

export function coreSkillTemplateByCanonicalName(name: string): SksCoreSkillTemplate | null {
  const canonical = canonicalSkillName(name);
  return buildSksCoreSkillManifest('1970-01-01T00:00:00.000Z').skills.find((skill) => skill.canonical_name === canonical) || null;
}

export function isSksManagedCoreSkillContent(text: string): boolean {
  const value = String(text || '');
  return value.includes(CORE_SKILL_MANAGED_BEGIN) && value.includes(CORE_SKILL_MANAGED_END);
}
