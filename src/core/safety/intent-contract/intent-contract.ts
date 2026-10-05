import { createHash } from 'node:crypto';
import { canonicalJson } from '../../json/canonical.js';

export type IntentRisk = 'FAST' | 'HEAVY' | 'ULTRA';
export type IntentEffect = 'read' | 'write' | 'auth' | 'security' | 'delete' | 'deploy' | 'dependency';
export type RoutingRuntimeSnapshot = 'desktop-bridge' | 'unmanaged';

export interface IntentContract {
  readonly schema: 'sks.intent-contract.v1';
  readonly contract_hash: string;
  readonly natural_language_effect: string;
  readonly effect: IntentEffect;
  readonly observed_changed_paths: readonly string[];
  readonly canonical_command: string;
  readonly target_hashes: readonly string[];
  readonly policy_version: string;
  readonly runtime_snapshot: RoutingRuntimeSnapshot;
  readonly evidence_state: 'valid' | 'expired' | 'missing';
  readonly retry_budget: number;
  readonly risk: IntentRisk;
  readonly risk_reason: string;
  readonly force: boolean;
}

export function buildIntentContract(input: {
  naturalLanguageEffect: string;
  effect: IntentEffect;
  observedChangedPaths?: readonly string[];
  canonicalCommand: string;
  targetHashes: readonly string[];
  policyVersion: string;
  runtimeSnapshot: RoutingRuntimeSnapshot;
  evidenceState: IntentContract['evidence_state'];
  retryBudget?: number;
  requestedRisk?: IntentRisk;
  explicitUltraOptIn?: boolean;
  force?: boolean;
}): IntentContract {
  const highRiskEffect = ['auth', 'security', 'delete', 'deploy', 'dependency'].includes(input.effect);
  let risk: IntentRisk = highRiskEffect ? 'HEAVY' : 'FAST';
  if (input.requestedRisk === 'HEAVY') risk = 'HEAVY';
  if (input.requestedRisk === 'ULTRA') {
    if (!input.explicitUltraOptIn) throw new Error('intent_ultra_requires_explicit_opt_in');
    risk = 'ULTRA';
  }
  const base = {
    schema: 'sks.intent-contract.v1' as const,
    natural_language_effect: normalizeEffectText(input.naturalLanguageEffect),
    effect: input.effect,
    observed_changed_paths: [...new Set((input.observedChangedPaths || []).map(normalizeRelativePath))].sort(),
    canonical_command: normalizeCommand(input.canonicalCommand),
    target_hashes: [...new Set(input.targetHashes)].sort(),
    policy_version: safeIdentifier(input.policyVersion, 'intent_policy_version_invalid'),
    runtime_snapshot: input.runtimeSnapshot,
    evidence_state: input.evidenceState,
    retry_budget: Math.max(0, Math.min(2, input.retryBudget ?? 0)),
    risk,
    risk_reason: highRiskEffect ? `effect_${input.effect}_requires_heavy` : risk === 'FAST' ? 'effect_is_fast_eligible' : 'user_requested_risk_raise',
    force: input.force === true
  };
  if (!base.target_hashes.length || base.target_hashes.some((hash) => !/^[a-f0-9]{64}$/.test(hash))) throw new Error('intent_target_hash_invalid');
  const contract = { ...base, contract_hash: stableHash(base) };
  return deepFreeze(contract);
}

function normalizeEffectText(value: string): string {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text || text.length > 1000) throw new Error('intent_effect_text_invalid');
  return text;
}

function normalizeRelativePath(value: string): string {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) throw new Error('intent_changed_path_invalid');
  return normalized;
}

function normalizeCommand(value: string): string {
  const command = String(value || '').trim().replace(/\s+/g, ' ');
  if (!/^sks(?:\s|$)/.test(command)) throw new Error('intent_canonical_command_invalid');
  return command;
}

function safeIdentifier(value: string, code: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(String(value || ''))) throw new Error(code);
  return value;
}

function stableHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
