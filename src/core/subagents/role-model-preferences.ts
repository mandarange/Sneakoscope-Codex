import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeTextAtomic } from '../fsx.js';
import {
  MANAGED_OFFICIAL_SUBAGENT_ROLES,
  managedOfficialSubagentRoleByName
} from '../managed-assets/managed-assets-manifest.js';

export const ROLE_MODEL_PREFERENCES_SCHEMA = 'sks.role-model-preferences.v1' as const;

export type SupportedRoleModel = 'gpt-5.6-luna' | 'gpt-5.6-terra' | 'gpt-5.6-sol';
export type SupportedRoleReasoningEffort = 'medium' | 'high' | 'max';

export interface RoleModelPreference {
  readonly model: SupportedRoleModel;
  readonly reasoning_effort: SupportedRoleReasoningEffort;
  readonly updated_at: string;
}

export interface RoleModelPreferenceStore {
  readonly schema: typeof ROLE_MODEL_PREFERENCES_SCHEMA;
  readonly version: 1;
  readonly updated_at: string;
  readonly roles: Readonly<Record<string, RoleModelPreference>>;
}

export const SUPPORTED_ROLE_MODEL_PROFILES = Object.freeze([
  Object.freeze({ model: 'gpt-5.6-luna', reasoning_effort: 'max' }),
  Object.freeze({ model: 'gpt-5.6-terra', reasoning_effort: 'medium' }),
  Object.freeze({ model: 'gpt-5.6-sol', reasoning_effort: 'high' }),
  Object.freeze({ model: 'gpt-5.6-sol', reasoning_effort: 'max' })
] as const);

export function roleModelPreferencesPath(env: NodeJS.ProcessEnv = process.env): string {
  const sksHome = path.resolve(env.SKS_HOME || path.join(env.HOME || os.homedir(), '.sneakoscope'));
  return path.join(sksHome, 'preferences', 'role-models.json');
}

export async function readRoleModelPreferences(input: {
  readonly env?: NodeJS.ProcessEnv;
  readonly filePath?: string;
} = {}): Promise<{ store: RoleModelPreferenceStore; path: string; blockers: string[] }> {
  const filePath = input.filePath || roleModelPreferencesPath(input.env || process.env);
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as Partial<RoleModelPreferenceStore>;
    if (parsed.schema !== ROLE_MODEL_PREFERENCES_SCHEMA || parsed.version !== 1 || !isRecord(parsed.roles)) {
      return { store: emptyStore(), path: filePath, blockers: ['role_model_preferences_invalid_schema'] };
    }
    const roles: Record<string, RoleModelPreference> = {};
    const blockers: string[] = [];
    for (const [rawRole, rawPreference] of Object.entries(parsed.roles)) {
      const role = managedOfficialSubagentRoleByName(rawRole);
      if (!role || !isRecord(rawPreference)) {
        blockers.push(`role_model_preference_invalid_role:${rawRole}`);
        continue;
      }
      const model = String(rawPreference.model || '');
      const reasoning = String(rawPreference.reasoning_effort || '');
      const profile = supportedRoleModelProfile(model, reasoning);
      if (!profile) {
        blockers.push(`role_model_preference_invalid_profile:${role.codex_name}`);
        continue;
      }
      roles[role.codex_name] = {
        model: profile.model,
        reasoning_effort: profile.reasoning_effort,
        updated_at: String(rawPreference.updated_at || parsed.updated_at || '')
      };
    }
    return {
      store: {
        schema: ROLE_MODEL_PREFERENCES_SCHEMA,
        version: 1,
        updated_at: String(parsed.updated_at || ''),
        roles
      },
      path: filePath,
      blockers
    };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return { store: emptyStore(), path: filePath, blockers: [] };
    return { store: emptyStore(), path: filePath, blockers: ['role_model_preferences_unreadable'] };
  }
}

export async function roleModelPreferencesStatus(input: {
  readonly env?: NodeJS.ProcessEnv;
  readonly filePath?: string;
} = {}) {
  const read = await readRoleModelPreferences(input);
  const roles = MANAGED_OFFICIAL_SUBAGENT_ROLES.map((role) => {
    const override = read.store.roles[role.codex_name] || null;
    return {
      role: role.codex_name,
      description: role.description,
      default_model: role.model,
      default_reasoning_effort: role.model_reasoning_effort,
      override,
      effective_model: override?.model || role.model,
      effective_reasoning_effort: override?.reasoning_effort || role.model_reasoning_effort
    };
  });
  return {
    schema: 'sks.role-model-preferences-status.v1',
    ok: read.blockers.length === 0,
    path: read.path,
    owner_only: true,
    supported_profiles: SUPPORTED_ROLE_MODEL_PROFILES,
    roles,
    blockers: read.blockers,
    warnings: []
  };
}

export async function setRoleModelPreference(input: {
  readonly role: string;
  readonly model: string;
  readonly reasoning: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly filePath?: string;
  readonly now?: () => string;
}) {
  const role = managedOfficialSubagentRoleByName(String(input.role || '').trim());
  if (!role) return mutationBlocked('role_model_role_invalid');
  const profile = supportedRoleModelProfile(input.model, input.reasoning);
  if (!profile) {
    return mutationBlocked('role_model_profile_unsupported');
  }
  const read = await readRoleModelPreferences(input);
  if (read.blockers.length) return mutationBlocked(...read.blockers);
  const timestamp = (input.now || (() => new Date().toISOString()))();
  const store: RoleModelPreferenceStore = {
    schema: ROLE_MODEL_PREFERENCES_SCHEMA,
    version: 1,
    updated_at: timestamp,
    roles: {
      ...read.store.roles,
      [role.codex_name]: {
        model: profile.model,
        reasoning_effort: profile.reasoning_effort,
        updated_at: timestamp
      }
    }
  };
  await writeOwnerOnlyStore(read.path, store);
  return {
    schema: 'sks.role-model-preference-mutation.v1',
    ok: true,
    status: 'set',
    role: role.codex_name,
    model: profile.model,
    reasoning_effort: profile.reasoning_effort,
    path: read.path,
    blockers: [],
    warnings: []
  };
}

export async function resetRoleModelPreference(input: {
  readonly role: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly filePath?: string;
  readonly now?: () => string;
}) {
  const role = managedOfficialSubagentRoleByName(String(input.role || '').trim());
  if (!role) return mutationBlocked('role_model_role_invalid');
  const read = await readRoleModelPreferences(input);
  if (read.blockers.length) return mutationBlocked(...read.blockers);
  const roles = { ...read.store.roles };
  delete roles[role.codex_name];
  const store: RoleModelPreferenceStore = {
    schema: ROLE_MODEL_PREFERENCES_SCHEMA,
    version: 1,
    updated_at: (input.now || (() => new Date().toISOString()))(),
    roles
  };
  await writeOwnerOnlyStore(read.path, store);
  return {
    schema: 'sks.role-model-preference-mutation.v1',
    ok: true,
    status: 'reset',
    role: role.codex_name,
    path: read.path,
    blockers: [],
    warnings: []
  };
}

export function isSupportedRoleModelProfile(
  model: unknown,
  reasoning: unknown
): boolean {
  return supportedRoleModelProfile(model, reasoning) !== null;
}

function supportedRoleModelProfile(
  model: unknown,
  reasoning: unknown
): { model: SupportedRoleModel; reasoning_effort: SupportedRoleReasoningEffort } | null {
  const normalizedModel = String(model || '').trim();
  const normalizedReasoning = String(reasoning || '').trim();
  const profile = SUPPORTED_ROLE_MODEL_PROFILES.find((profile) => (
    profile.model === normalizedModel && profile.reasoning_effort === normalizedReasoning
  ));
  return profile ? { model: profile.model, reasoning_effort: profile.reasoning_effort } : null;
}

async function writeOwnerOnlyStore(filePath: string, store: RoleModelPreferenceStore): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await writeTextAtomic(filePath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
}

function emptyStore(): RoleModelPreferenceStore {
  return { schema: ROLE_MODEL_PREFERENCES_SCHEMA, version: 1, updated_at: '', roles: {} };
}

function mutationBlocked(...blockers: string[]) {
  return {
    schema: 'sks.role-model-preference-mutation.v1',
    ok: false,
    status: 'blocked',
    blockers,
    warnings: []
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
