import { createHash } from 'node:crypto';

export const LEAN_ENGINEERING_POLICY_ID = 'sks.lean-engineering-policy.v1';
export const LEAN_DECISION_SCHEMA = 'sks.lean-decision.v1';
export const LEAN_CHANGE_EVIDENCE_SCHEMA = 'sks.lean-change-evidence.v1';

export const LEAN_SOLUTION_RUNGS = Object.freeze([
  'skip',
  'reuse-existing',
  'stdlib',
  'native-platform',
  'installed-dependency',
  'single-expression',
  'minimal-custom'
] as const);

export type LeanSolutionRung = typeof LEAN_SOLUTION_RUNGS[number];
export type LeanFallbackKind = 'none' | 'capability' | 'compatibility' | 'fail-closed';
export type LeanFindingTag = 'delete' | 'reuse' | 'stdlib' | 'platform' | 'yagni' | 'shrink' | 'fallback' | 'root-cause' | 'verify';

export interface LeanFallbackPlan {
  kind: LeanFallbackKind;
  authority: string | null;
  justification: string | null;
}

export interface LeanDecision {
  schema: typeof LEAN_DECISION_SCHEMA;
  policy_id: typeof LEAN_ENGINEERING_POLICY_ID;
  policy_hash: string;
  selected_rung: LeanSolutionRung;
  task_requires_change: boolean;
  root_cause_target: string | null;
  reused_paths: string[];
  stdlib_or_native_choice: string | null;
  new_dependency_requested: boolean;
  new_dependency_justification: string | null;
  new_abstraction_requested: boolean;
  new_abstraction_justification: string | null;
  fallback_plan: LeanFallbackPlan;
  expected_changed_paths: string[];
  verification_minimum: string[];
}

export interface LeanSimplificationMarker {
  file: string;
  line: number;
  ceiling: string | null;
  revisit_when: string | null;
  upgrade: string | null;
  status: 'complete' | 'missing-trigger' | 'missing-upgrade';
}

export interface LeanFinding {
  tag: LeanFindingTag;
  severity: 'info' | 'review' | 'blocker';
  summary: string;
  file?: string;
  line?: number;
}

const LEAN_ENGINEERING_POLICY_CANONICAL = [
  'Understand the real flow before changing code.',
  'Stop at the highest sufficient rung: skip, reuse existing code, stdlib, native platform, installed dependency, safe single expression, minimal custom code.',
  'Do not add unrequested routes, commands, daemons, dependencies, abstractions, config flags, shims, or hidden fallbacks.',
  'Fix shared root causes instead of duplicating caller-specific symptom guards.',
  'Capability and compatibility fallbacks require one authority, proof, bounded scope, and honest verification level.',
  'Never remove trust-boundary validation, data-loss protection, security, permissions, rollback, accessibility, or explicit user requirements to shrink a diff.',
  'Release verification must stay lean: release preset gates <= 200, package scripts <= 100, and one distinct user concern per gate.',
  'Non-trivial logic needs one smallest runnable check.'
].join('\n');

export const LEAN_ENGINEERING_POLICY_HASH = createHash('sha256')
  .update(LEAN_ENGINEERING_POLICY_CANONICAL)
  .digest('hex')
  .slice(0, 16);

export function leanPolicyReference() {
  return {
    policy_id: LEAN_ENGINEERING_POLICY_ID,
    policy_hash: LEAN_ENGINEERING_POLICY_HASH
  };
}

export function leanEngineeringCompactText() {
  return [
    `Lean Engineering Policy (${LEAN_ENGINEERING_POLICY_ID}/${LEAN_ENGINEERING_POLICY_HASH}):`,
    'Read the touched flow first, then stop at the highest sufficient rung: skip, reuse existing, stdlib, native platform, installed dependency, safe single expression, minimal custom.',
    'No unrequested route/command/daemon/dependency/abstraction/config flag/shim/hidden fallback; required capability/compatibility fallback needs one authority, proof, and bounded scope.',
    'Fix root cause once, preserve trust-boundary validation/security/rollback/accessibility/user requirements, keep release gates <= 200 and package scripts <= 100, and leave one runnable check for non-trivial logic.'
  ].join('\n');
}

export function leanEngineeringLongText() {
  return [
    leanEngineeringCompactText(),
    'Forbidden fallback: silent mock/fixture success, provider contract switching without authority, catch-all empty success, unused future shims, duplicate legacy/new SSOTs, or production proof from test fakes.',
    'Allowed fallback: same contract or explicit narrower contract, capability detection, one selection authority, recorded provider/proof level, honest downgrade when used, and a bounded chain.',
    'Compatibility bridge: one canonical implementation; legacy entry only converts arguments, emits deprecation context, and has a sunset trigger.',
    'Intentional simplification marker: `sks-lean: ceiling=<known limit>; revisit_when=<measurable trigger>; upgrade=<specific path>`.'
  ].join('\n');
}

export function normalizeLeanDecision(input: unknown = {}, defaults: Partial<LeanDecision> = {}): LeanDecision {
  const value = record(input);
  const defaultFallback = defaults.fallback_plan || { kind: 'none', authority: null, justification: null };
  return {
    schema: LEAN_DECISION_SCHEMA,
    policy_id: LEAN_ENGINEERING_POLICY_ID,
    policy_hash: LEAN_ENGINEERING_POLICY_HASH,
    selected_rung: normalizeRung(value.selected_rung, defaults.selected_rung || 'minimal-custom'),
    task_requires_change: booleanValue(value.task_requires_change, defaults.task_requires_change ?? true),
    root_cause_target: nullableString(value.root_cause_target, defaults.root_cause_target ?? null),
    reused_paths: stringArray(value.reused_paths, defaults.reused_paths),
    stdlib_or_native_choice: nullableString(value.stdlib_or_native_choice, defaults.stdlib_or_native_choice ?? null),
    new_dependency_requested: booleanValue(value.new_dependency_requested, defaults.new_dependency_requested ?? false),
    new_dependency_justification: nullableString(value.new_dependency_justification, defaults.new_dependency_justification ?? null),
    new_abstraction_requested: booleanValue(value.new_abstraction_requested, defaults.new_abstraction_requested ?? false),
    new_abstraction_justification: nullableString(value.new_abstraction_justification, defaults.new_abstraction_justification ?? null),
    fallback_plan: normalizeFallbackPlan(value.fallback_plan, defaultFallback),
    expected_changed_paths: stringArray(value.expected_changed_paths, defaults.expected_changed_paths),
    verification_minimum: stringArray(value.verification_minimum, defaults.verification_minimum)
  };
}

export function validateLeanDecision(input: unknown): { ok: boolean; issues: string[] } {
  const value = record(input);
  const issues: string[] = [];
  if (value.schema !== LEAN_DECISION_SCHEMA) issues.push('schema');
  if (value.policy_id !== LEAN_ENGINEERING_POLICY_ID) issues.push('policy_id');
  if (value.policy_hash !== LEAN_ENGINEERING_POLICY_HASH) issues.push('policy_hash');
  if (!isLeanSolutionRung(value.selected_rung)) issues.push('selected_rung');
  if (typeof value.task_requires_change !== 'boolean') issues.push('task_requires_change');
  if (!Array.isArray(value.reused_paths)) issues.push('reused_paths');
  if (!Array.isArray(value.expected_changed_paths)) issues.push('expected_changed_paths');
  if (!Array.isArray(value.verification_minimum)) issues.push('verification_minimum');
  const fallback = record(value.fallback_plan);
  if (!isFallbackKind(fallback.kind)) issues.push('fallback_plan.kind');
  if (fallback.kind !== 'none' && (!fallback.authority || !fallback.justification)) issues.push('fallback_plan.evidence');
  if (value.new_dependency_requested === true && !value.new_dependency_justification) issues.push('new_dependency_justification');
  if (value.new_abstraction_requested === true && !value.new_abstraction_justification) issues.push('new_abstraction_justification');
  if (value.selected_rung === 'skip' && value.task_requires_change === true) issues.push('skip_requires_no_change');
  if (value.task_requires_change === true && !value.verification_minimum?.length) issues.push('verification_minimum_required');
  return { ok: issues.length === 0, issues };
}

export function parseLeanSimplificationMarkerLine(text: string, file = '', line = 0): LeanSimplificationMarker | null {
  const match = /^\s*(?:(?:\/\/|#)\s*)sks-lean:\s*(.+)$/i.exec(text);
  if (!match) return null;
  const fields = Object.fromEntries((match[1] || '').split(';').map((part) => {
    const [key, ...rest] = part.split('=');
    return [String(key || '').trim(), rest.join('=').trim()];
  }));
  const ceiling = fields.ceiling || null;
  const revisit = fields.revisit_when || null;
  const upgrade = fields.upgrade || null;
  return {
    file,
    line,
    ceiling,
    revisit_when: revisit,
    upgrade,
    status: !revisit ? 'missing-trigger' : !upgrade ? 'missing-upgrade' : 'complete'
  };
}

function normalizeFallbackPlan(input: unknown, defaults: LeanFallbackPlan): LeanFallbackPlan {
  const value = record(input);
  const kind = isFallbackKind(value.kind) ? value.kind : defaults.kind;
  return {
    kind,
    authority: nullableString(value.authority, defaults.authority),
    justification: nullableString(value.justification, defaults.justification)
  };
}

function normalizeRung(value: unknown, fallback: LeanSolutionRung): LeanSolutionRung {
  return isLeanSolutionRung(value) ? value : fallback;
}

function isLeanSolutionRung(value: unknown): value is LeanSolutionRung {
  return typeof value === 'string' && (LEAN_SOLUTION_RUNGS as readonly string[]).includes(value);
}

function isFallbackKind(value: unknown): value is LeanFallbackKind {
  return value === 'none' || value === 'capability' || value === 'compatibility' || value === 'fail-closed';
}

function stringArray(value: unknown, fallback: unknown = []): string[] {
  const source = Array.isArray(value) ? value : Array.isArray(fallback) ? fallback : [];
  return source.map((item) => String(item || '').trim()).filter(Boolean);
}

function nullableString(value: unknown, fallback: string | null = null): string | null {
  const text = String(value ?? '').trim();
  if (text) return text;
  return fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}
