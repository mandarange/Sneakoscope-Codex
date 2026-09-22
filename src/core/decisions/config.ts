import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js';
import { ensureConfinedDirectory, inspectConfinedPath, ManagedPathSafetyError } from '../managed-path-safety.js';
import {
  DESIGN_DEFAULTS,
  type DecisionCapabilityState,
  type DecisionConfig,
  type DecisionMode
} from './types.js';

export const DECISION_CONFIG_SCHEMA = 'sks.jev-decision-config.v1' as const;
const CONFIG_DIRNAME = 'decisions';

export interface DecisionPaths {
  sksHome: string;
  configDir: string;
  configPath: string;
}

export function decisionPaths(env: NodeJS.ProcessEnv = process.env): DecisionPaths {
  const sksHome = path.resolve(env.SKS_HOME || path.join(env.HOME || os.homedir(), '.sneakoscope'));
  const configDir = path.join(sksHome, CONFIG_DIRNAME);
  return {
    sksHome,
    configDir,
    configPath: path.join(configDir, 'config.json')
  };
}

export function defaultDecisionConfig(): DecisionConfig {
  return {
    schema: DECISION_CONFIG_SCHEMA,
    mode: DESIGN_DEFAULTS.mode,
    provider: 'openrouter',
    model: DESIGN_DEFAULTS.model,
    consentCloud: false,
    consentAt: null,
    capabilities: {
      context: capability(false, false, 'not_enabled'),
      plan: capability(false, false, 'not_enabled'),
      recovery: capability(false, false, 'unsupported_no_sks_handler')
    },
    updatedAt: null
  };
}

export async function readDecisionConfig(
  env: NodeJS.ProcessEnv = process.env
): Promise<DecisionConfig> {
  const paths = decisionPaths(env);
  const current = await readJson<unknown>(paths.configPath, null).catch(() => null);
  return current ? normalizeConfig(current) : defaultDecisionConfig();
}

export async function writeDecisionConfig(
  patch: Partial<Pick<DecisionConfig, 'mode' | 'consentCloud' | 'consentAt' | 'model'>> & {
    capabilities?: Partial<DecisionConfig['capabilities']>;
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<DecisionConfig> {
  const paths = decisionPaths(env);
  const current = await readDecisionConfig(env);
  const next: DecisionConfig = {
    ...current,
    ...(patch.mode === undefined ? {} : { mode: patch.mode }),
    ...(patch.model === undefined ? {} : { model: patch.model }),
    ...(patch.consentCloud === undefined ? {} : { consentCloud: patch.consentCloud }),
    ...(patch.consentAt === undefined ? {} : { consentAt: patch.consentAt }),
    capabilities: {
      context: patch.capabilities?.context || current.capabilities.context,
      plan: patch.capabilities?.plan || current.capabilities.plan,
      recovery: current.capabilities.recovery
    },
    updatedAt: nowIso()
  };
  if (next.mode !== 'off' && next.mode !== 'jev') throw new Error(`invalid_decision_mode:${String(next.mode)}`);
  if (next.mode === 'jev' && next.consentCloud !== true) throw new Error('jev_cloud_consent_required');
  if (next.model !== DESIGN_DEFAULTS.model) throw new Error(`unsupported_decision_model:${next.model}`);
  await fsp.mkdir(paths.sksHome, { recursive: true });
  await ensureConfinedDirectory(paths.sksHome, paths.configDir);
  const inspected = await inspectConfinedPath(paths.sksHome, paths.configPath);
  if (inspected.leafSymlink) {
    throw new ManagedPathSafetyError('managed_path_leaf_symlink_refused', inspected.path);
  }
  await writeJsonAtomic(inspected.path, next, { mode: 0o600 });
  return next;
}

export function jevEnabled(config: DecisionConfig): boolean {
  return config.mode === 'jev' && config.consentCloud === true;
}

function normalizeConfig(raw: unknown): DecisionConfig {
  const fallback = defaultDecisionConfig();
  if (!isRecord(raw) || raw.schema !== DECISION_CONFIG_SCHEMA) return fallback;
  const mode: DecisionMode = raw.mode === 'jev' ? 'jev' : 'off';
  const consentCloud = raw.consentCloud === true;
  return {
    schema: DECISION_CONFIG_SCHEMA,
    mode: mode === 'jev' && consentCloud ? 'jev' : 'off',
    provider: 'openrouter',
    model: typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : DESIGN_DEFAULTS.model,
    consentCloud,
    consentAt: typeof raw.consentAt === 'string' ? raw.consentAt : null,
    capabilities: {
      context: normalizeCapability(raw.capabilities, 'context', fallback.capabilities.context),
      plan: normalizeCapability(raw.capabilities, 'plan', fallback.capabilities.plan),
      recovery: capability(false, false, 'unsupported_no_sks_handler')
    },
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null
  };
}

function normalizeCapability(
  raw: unknown,
  key: 'context' | 'plan',
  fallback: DecisionCapabilityState
): DecisionCapabilityState {
  if (!isRecord(raw) || !isRecord(raw[key])) return fallback;
  const row = raw[key];
  return {
    ready: row.ready === true,
    promoted: row.promoted === true,
    reason: typeof row.reason === 'string' ? row.reason : fallback.reason
  };
}

function capability(ready: boolean, promoted: boolean, reason: string | null): DecisionCapabilityState {
  return { ready, promoted, reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
