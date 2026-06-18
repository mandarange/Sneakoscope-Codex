import os from 'node:os';

export const RESOURCE_CLASS_BUDGET_SCHEMA = 'sks.resource-class-budget.v1';

export interface ResourceClassBudget {
  schema: typeof RESOURCE_CLASS_BUDGET_SCHEMA;
  cpu_light: number;
  cpu_heavy: number;
  io_light: number;
  io_heavy: number;
  fs_read: number;
  network: number;
  remote_model_real: number;
  zellij_real: number;
  browser_real: number;
  secret_sensitive: number;
}

export function computeResourceClassBudget(env: NodeJS.ProcessEnv = process.env): ResourceClassBudget {
  const cpus = Math.max(2, os.cpus().length || 2);
  return {
    schema: RESOURCE_CLASS_BUDGET_SCHEMA,
    cpu_light: readEnvInt(env, 'SKS_RESOURCE_CPU_LIGHT', Math.max(2, cpus - 1)),
    cpu_heavy: readEnvInt(env, 'SKS_RESOURCE_CPU_HEAVY', Math.max(1, Math.floor(cpus / 2))),
    io_light: readEnvInt(env, 'SKS_RESOURCE_IO_LIGHT', 8),
    io_heavy: readEnvInt(env, 'SKS_RESOURCE_IO_HEAVY', 2),
    fs_read: readEnvInt(env, 'SKS_RESOURCE_FS_READ', 8),
    network: readEnvInt(env, 'SKS_RESOURCE_NETWORK', 2),
    remote_model_real: readEnvInt(env, 'SKS_RESOURCE_REMOTE_MODEL_REAL', 1),
    zellij_real: readEnvInt(env, 'SKS_RESOURCE_ZELLIJ_REAL', 1),
    browser_real: readEnvInt(env, 'SKS_RESOURCE_BROWSER_REAL', 1),
    secret_sensitive: readEnvInt(env, 'SKS_RESOURCE_SECRET', 1)
  };
}

function readEnvInt(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const value = Number(env[key]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
