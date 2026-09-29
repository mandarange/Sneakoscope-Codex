/**
 * Who authenticates a Naruto subagent run.
 *
 * By default SKS owns the policy: it pins `model_provider="openai"` and
 * `forced_login_method="chatgpt"` so an operator's interactive ChatGPT session
 * is the credential, and the run cannot silently drift onto some other provider.
 *
 * That default is wrong for an unattended host. An orchestrator that already
 * holds and rotates a customer's OpenAI-compatible credential (an unmanaged
 * custom `env_key` provider block) cannot log in
 * interactively on every node, and forcing `chatgpt` makes Codex treat an
 * `auth_mode="apikey"` session as a hard logout and delete `auth.json`. Host
 * mode hands that decision back: SKS stops injecting the provider and the login
 * method, and Codex uses the provider block the host configured.
 *
 * SKS never reads, stores, forwards, or logs the credential itself. It only
 * names the provider block; the key stays wherever the host put it.
 */

import fs from 'node:fs';
import { codexUserConfigPath, readTopLevelTomlString } from '../codex-app/codex-model-catalog.js';
import { isOpenRouterModelId } from '../imagegen/imagegen-config.js';
import { defaultSubagentModel } from './model-policy.js';
import { codexListedEfforts, latestTierModelSet } from './model-tiers.js';
import {
  SUBAGENT_MODEL_EFFORTS,
  defaultSubagentEntry,
  readOpenRouterOnlyStateSync,
  subagentEntryForModel,
  type OpenRouterOnlyLocation,
  type OpenRouterOnlyState
} from './child-model-allowlist.js';

export const NARUTO_AUTH_MODES = ['managed', 'host'] as const;

export type NarutoAuthMode = (typeof NARUTO_AUTH_MODES)[number];

/** Config-block and model identifiers only — never a URL, a path, or a secret. */
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const RETIRED_DIRECT_MANAGED_PROVIDERS = new Set(['codex-lb', 'openrouter']);

export const NARUTO_EFFORT_TIERS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const;

export interface NarutoCredentialPolicyInput {
  readonly args?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
  readonly defaultParentModel: string;
  readonly defaultParentEffort: string;
  readonly defaultSubagentModel: string;
  readonly defaultSubagentEffort: string;
  /** OpenRouter Only Mode, when on; read from the Codex home when omitted. */
  readonly openRouterOnly?: NarutoOpenRouterOnlyContext | null;
}

/** What a standalone run needs to know while OpenRouter Only Mode is on. */
export interface NarutoOpenRouterOnlyContext {
  readonly state: OpenRouterOnlyState;
  /** Top-level `model` in the user's Codex config.toml: the parent model. */
  readonly mainModel: string | null;
}

/** Top-level `model` in the Codex config.toml Codex itself reads (CODEX_HOME first), or null. */
export function readCodexMainModel(location: OpenRouterOnlyLocation = {}): string | null {
  try {
    return readTopLevelTomlString(fs.readFileSync(codexUserConfigPath(location), 'utf8'), 'model')?.trim() || null;
  } catch {
    return null;
  }
}

/** Null while the mode is off, so the tier policy below applies unchanged. */
export function readNarutoOpenRouterOnlyContext(location: OpenRouterOnlyLocation = {}): NarutoOpenRouterOnlyContext | null {
  const state = readOpenRouterOnlyStateSync(location);
  if (!state.enabled) return null;
  return { state, mainModel: readCodexMainModel(location) };
}

export interface NarutoCredentialPolicy {
  readonly schema: 'sks.naruto-credential-policy.v1';
  readonly authMode: NarutoAuthMode;
  /** `config.toml` provider block name, or `null` to leave Codex's own default alone. */
  readonly modelProvider: string | null;
  /** `null` means SKS injects no `forced_login_method` and the host's auth stands. */
  readonly forcedLoginMethod: 'chatgpt' | null;
  /**
   * Name of the environment variable the provider block's `env_key` points at.
   * The child needs the value in its environment or Codex cannot authenticate,
   * so it is forwarded verbatim — and never read, logged, or written to a
   * receipt. Only the *name* appears anywhere in SKS output.
   */
  readonly providerEnvKey: string | null;
  readonly parentModel: string;
  readonly parentEffort: string;
  readonly subagentModel: string;
  readonly subagentEffort: string;
  /** `openrouter_only`: parent and children run OpenRouter models from the user's config and list. */
  readonly childModelMode: 'tiers' | 'openrouter_only';
  /** Where each decision came from, so a run receipt can explain itself. */
  readonly sources: Record<string, 'default' | 'flag' | 'env'>;
  readonly warnings: string[];
  readonly blockers: string[];
  /** How to fix the blockers, when SKS has a more specific answer than the host-auth hint. */
  readonly hint: string | null;
}

function readFlagValue(args: readonly string[], name: string): string | null {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) {
    const next = args[index + 1];
    if (next !== undefined && !next.startsWith('-')) return next;
  }
  return null;
}

interface Resolved {
  value: string | null;
  source: 'default' | 'flag' | 'env';
}

function resolve(args: readonly string[], env: NodeJS.ProcessEnv, flag: string, envKey: string): Resolved {
  const fromFlag = readFlagValue(args, flag);
  if (fromFlag !== null && fromFlag !== '') return { value: fromFlag, source: 'flag' };
  const fromEnv = env[envKey];
  if (typeof fromEnv === 'string' && fromEnv.trim()) return { value: fromEnv.trim(), source: 'env' };
  return { value: null, source: 'default' };
}

function validIdentifier(value: string): boolean {
  return IDENTIFIER_RE.test(value);
}

/**
 * Resolve the credential and model policy for one `sks naruto run`.
 *
 * A malformed identifier is a blocker rather than a silent fallback: quietly
 * dropping a provider the host asked for would run the mission on SKS's default
 * credential, which is exactly the surprise this contract exists to prevent.
 */
export function resolveNarutoCredentialPolicy(input: NarutoCredentialPolicyInput): NarutoCredentialPolicy {
  const args = input.args ?? [];
  const env = input.env ?? process.env;
  const warnings: string[] = [];
  const blockers: string[] = [];
  const sources: Record<string, 'default' | 'flag' | 'env'> = {};

  const authModeRaw = resolve(args, env, '--auth-mode', 'SKS_NARUTO_AUTH_MODE');
  let authMode: NarutoAuthMode = 'managed';
  if (authModeRaw.value !== null) {
    if ((NARUTO_AUTH_MODES as readonly string[]).includes(authModeRaw.value)) {
      authMode = authModeRaw.value as NarutoAuthMode;
      sources.authMode = authModeRaw.source;
    } else {
      blockers.push(`naruto_auth_mode_invalid:${authModeRaw.value}`);
    }
  }
  if (sources.authMode === undefined) sources.authMode = 'default';

  const providerRaw = resolve(args, env, '--model-provider', 'SKS_NARUTO_MODEL_PROVIDER');
  let modelProvider: string | null = authMode === 'host' ? null : 'openai';
  sources.modelProvider = 'default';
  if (providerRaw.value !== null) {
    if (!validIdentifier(providerRaw.value)) {
      blockers.push(`naruto_model_provider_invalid:${providerRaw.value.slice(0, 32)}`);
    } else if (authMode === 'managed') {
      // Naming a provider while SKS still forces a ChatGPT login would produce a
      // run that authenticates one way and bills another.
      blockers.push('naruto_model_provider_requires_host_auth_mode');
    } else if (RETIRED_DIRECT_MANAGED_PROVIDERS.has(providerRaw.value)) {
      blockers.push('desktop_bridge_direct_provider_selection_retired');
    } else {
      modelProvider = providerRaw.value;
      sources.modelProvider = providerRaw.source;
    }
  }

  const noForcedLogin = args.includes('--no-forced-login-method')
    || String(env.SKS_NARUTO_FORCED_LOGIN_METHOD ?? '').toLowerCase() === 'none';
  let forcedLoginMethod: 'chatgpt' | null = 'chatgpt';
  sources.forcedLoginMethod = 'default';
  if (authMode === 'host') {
    forcedLoginMethod = null;
    sources.forcedLoginMethod = sources.authMode;
  } else if (noForcedLogin) {
    forcedLoginMethod = null;
    sources.forcedLoginMethod = args.includes('--no-forced-login-method') ? 'flag' : 'env';
    warnings.push('naruto_forced_login_method_released_without_host_auth_mode');
  }

  const openRouterOnly = input.openRouterOnly === undefined ? readNarutoOpenRouterOnlyContext() : input.openRouterOnly;
  const models: ModelFlag[] = openRouterOnly
    ? openRouterOnlyModelFlags(input, openRouterOnly)
    : [
        { key: 'parentModel', flag: '--parent-model', envKey: 'SKS_NARUTO_PARENT_MODEL', fallback: input.defaultParentModel, effort: false },
        { key: 'parentEffort', flag: '--parent-effort', envKey: 'SKS_NARUTO_PARENT_EFFORT', fallback: input.defaultParentEffort, effort: true },
        { key: 'subagentModel', flag: '--subagent-model', envKey: 'SKS_NARUTO_SUBAGENT_MODEL', fallback: defaultSubagentModel(), effort: false },
        { key: 'subagentEffort', flag: '--subagent-effort', envKey: 'SKS_NARUTO_SUBAGENT_EFFORT', fallback: input.defaultSubagentEffort, effort: true }
      ];
  const resolvedModels: Record<string, string> = {};
  for (const entry of models) {
    const raw = resolve(args, env, entry.flag, entry.envKey);
    if (raw.value === null) {
      resolvedModels[entry.key] = entry.fallback;
      sources[entry.key] = 'default';
      continue;
    }
    const ok = entry.effort
      ? (NARUTO_EFFORT_TIERS as readonly string[]).includes(raw.value)
      : validIdentifier(raw.value) || (openRouterOnly !== null && isOpenRouterModelId(raw.value));
    if (!ok) {
      blockers.push(`naruto_${String(entry.key)}_invalid:${raw.value.slice(0, 32)}`);
      resolvedModels[entry.key] = entry.fallback;
      sources[entry.key] = 'default';
      continue;
    }
    resolvedModels[entry.key] = raw.value;
    sources[entry.key] = raw.source;
  }
  if (openRouterOnly) {
    validateOpenRouterOnlyModels(openRouterOnly, resolvedModels, sources, blockers);
  } else {
    // Children use a current model: the latest model of any tier, the same set
    // the spawn policy and Jev routing use. The default is the latest deep tier.
    if (!latestTierModelSet().has(String(resolvedModels.subagentModel))) {
      blockers.push('naruto_subagent_model_must_be_current');
      resolvedModels.subagentModel = defaultSubagentModel();
    }
    validateGpt56EffortPair('parent', String(resolvedModels.parentModel), String(resolvedModels.parentEffort), blockers);
    validateGpt56EffortPair('subagent', String(resolvedModels.subagentModel), String(resolvedModels.subagentEffort), blockers);
  }

  const envKeyRaw = resolve(args, env, '--provider-env-key', 'SKS_NARUTO_PROVIDER_ENV_KEY');
  let providerEnvKey: string | null = null;
  sources.providerEnvKey = 'default';
  if (envKeyRaw.value !== null) {
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(envKeyRaw.value)) {
      blockers.push(`naruto_provider_env_key_invalid:${envKeyRaw.value.slice(0, 32)}`);
    } else if (authMode === 'managed') {
      blockers.push('naruto_provider_env_key_requires_host_auth_mode');
    } else {
      providerEnvKey = envKeyRaw.value;
      sources.providerEnvKey = envKeyRaw.source;
    }
  }

  if (authMode === 'host' && modelProvider === null) {
    // Codex falls back to its own configured default, which is legitimate but
    // worth saying out loud in an unattended run.
    warnings.push('naruto_host_auth_mode_without_explicit_model_provider');
  }
  if (authMode === 'host' && providerEnvKey !== null && env[providerEnvKey] === undefined) {
    // Naming a key that is not in the environment would fail inside Codex with a
    // provider error that looks nothing like the real cause.
    blockers.push(`naruto_provider_env_key_absent:${providerEnvKey}`);
  }

  return {
    schema: 'sks.naruto-credential-policy.v1',
    authMode,
    modelProvider,
    forcedLoginMethod,
    providerEnvKey,
    parentModel: String(resolvedModels.parentModel),
    parentEffort: String(resolvedModels.parentEffort),
    subagentModel: String(resolvedModels.subagentModel),
    subagentEffort: String(resolvedModels.subagentEffort),
    childModelMode: openRouterOnly ? 'openrouter_only' : 'tiers',
    sources,
    warnings,
    blockers,
    hint: openRouterOnly && blockers.some((blocker) => OPENROUTER_ONLY_BLOCKER.test(blocker)) ? OPENROUTER_ONLY_HINT : null
  };
}

const OPENROUTER_ONLY_BLOCKER = /^naruto_(parent_model_not_openrouter|subagent_model_not_in_list|subagent_model_list_empty|parent_effort_unsupported_openrouter|subagent_effort_unsupported_openrouter)(:|$)/;
const OPENROUTER_ONLY_HINT = 'OpenRouter Only Mode is on: the parent runs the OpenRouter main model in Codex config.toml and children run only models on the subagent list (Control Center > Subagent Models, or `sks bridge subagent-models list`); pass --parent-model=<vendor/model>, --subagent-model=<a listed model>, and efforts low|medium|high|xhigh';

interface ModelFlag {
  key: keyof NarutoCredentialPolicy;
  flag: string;
  envKey: string;
  fallback: string;
  effort: boolean;
}

/** OpenRouter rows list low..xhigh; the GPT-only `max`/`ultra` map to the deepest one. */
const OPENROUTER_ONLY_PARENT_EFFORT = 'xhigh';

function openRouterOnlyEffort(value: string | null | undefined, fallback: string): string {
  return value && (SUBAGENT_MODEL_EFFORTS as readonly string[]).includes(value) ? value : fallback;
}

/**
 * OpenRouter Only Mode defaults: the parent is the main model in config.toml
 * (the Desktop Bridge routes it to OpenRouter) and the child default is the
 * list's default entry at its effort. Flags may still name another list model.
 */
function openRouterOnlyModelFlags(input: NarutoCredentialPolicyInput, context: NarutoOpenRouterOnlyContext): ModelFlag[] {
  const listDefault = defaultSubagentEntry(context.state);
  return [
    { key: 'parentModel', flag: '--parent-model', envKey: 'SKS_NARUTO_PARENT_MODEL', fallback: context.mainModel || '', effort: false },
    { key: 'parentEffort', flag: '--parent-effort', envKey: 'SKS_NARUTO_PARENT_EFFORT', fallback: openRouterOnlyEffort(input.defaultParentEffort, OPENROUTER_ONLY_PARENT_EFFORT), effort: true },
    { key: 'subagentModel', flag: '--subagent-model', envKey: 'SKS_NARUTO_SUBAGENT_MODEL', fallback: listDefault?.model || '', effort: false },
    { key: 'subagentEffort', flag: '--subagent-effort', envKey: 'SKS_NARUTO_SUBAGENT_EFFORT', fallback: openRouterOnlyEffort(listDefault?.reasoning_effort ?? input.defaultSubagentEffort, 'medium'), effort: true }
  ];
}

/**
 * Nothing outside the mode's models may reach Codex: the parent must be an
 * OpenRouter model and the child default must be on the user's list, each at
 * an effort the OpenRouter catalog rows list.
 */
function validateOpenRouterOnlyModels(
  context: NarutoOpenRouterOnlyContext,
  resolved: Record<string, string>,
  sources: Record<string, 'default' | 'flag' | 'env'>,
  blockers: string[]
): void {
  const parent = String(resolved.parentModel || '');
  const parentLabel = parent.slice(0, 64) || 'unset';
  if (!isOpenRouterModelId(parent)) blockers.push(`naruto_parent_model_not_openrouter:${parentLabel}`);
  const listDefault = defaultSubagentEntry(context.state);
  if (!listDefault) {
    blockers.push('naruto_subagent_model_list_empty');
  } else {
    const listed = subagentEntryForModel(context.state, resolved.subagentModel);
    if (!listed) blockers.push(`naruto_subagent_model_not_in_list:${String(resolved.subagentModel || '').slice(0, 64)}`);
    const entry = listed ?? listDefault;
    resolved.subagentModel = entry.model;
    // A chosen entry brings its own effort unless the run named one.
    if (sources.subagentEffort === 'default' && entry.reasoning_effort) resolved.subagentEffort = entry.reasoning_effort;
  }
  for (const scope of ['parent', 'subagent'] as const) {
    const effort = String(resolved[`${scope}Effort`] || '');
    if (!(SUBAGENT_MODEL_EFFORTS as readonly string[]).includes(effort)) {
      blockers.push(`naruto_${scope}_effort_unsupported_openrouter:${effort}:allowed_${SUBAGENT_MODEL_EFFORTS.join('_or_')}`);
    }
  }
}

/** An explicit effort must be one Codex lists for that model; unknown models are not second-guessed. */
function validateGpt56EffortPair(
  scope: 'parent' | 'subagent',
  model: string,
  effort: string,
  blockers: string[]
): void {
  const allowed = codexListedEfforts(model);
  if (allowed && !allowed.includes(effort)) {
    blockers.push(`naruto_${scope}_effort_unsupported:${model}:${effort}:allowed_${allowed.join('_or_')}`);
  }
}

/** The `-c` overrides this policy contributes. Empty in host mode by design. */
export function narutoCredentialConfigArgs(policy: NarutoCredentialPolicy): string[] {
  const out: string[] = [];
  if (policy.modelProvider && !RETIRED_DIRECT_MANAGED_PROVIDERS.has(policy.modelProvider)) {
    out.push('-c', `model_provider="${policy.modelProvider}"`);
  }
  if (policy.forcedLoginMethod) out.push('-c', `forced_login_method="${policy.forcedLoginMethod}"`);
  return out;
}

/** Bounded, secret-free projection for a run receipt or proof card. */
export function narutoCredentialPolicyReceipt(policy: NarutoCredentialPolicy): Record<string, unknown> {
  return {
    schema: policy.schema,
    auth_mode: policy.authMode,
    model_provider: policy.modelProvider,
    forced_login_method: policy.forcedLoginMethod,
    // The NAME only. The value never leaves the host's environment.
    provider_env_key: policy.providerEnvKey,
    parent_model: policy.parentModel,
    parent_effort: policy.parentEffort,
    subagent_model: policy.subagentModel,
    subagent_effort: policy.subagentEffort,
    child_model_mode: policy.childModelMode,
    sources: policy.sources,
    warnings: policy.warnings,
    blockers: policy.blockers,
    credential_handled_by: policy.authMode === 'host' ? 'host_config_toml_provider_block' : 'sks_managed_chatgpt_login'
  };
}
