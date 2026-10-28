/**
 * The pieces of a model-list refresh around the catalog sync itself
 * (`refreshModelCatalog` in catalog.ts): when a refresh may be skipped, what it
 * changed, and where Codex reads the list from afterwards.
 *
 * Codex reads the list one of two ways. With a ChatGPT sign-in it fetches the
 * bridge's `/models` and follows `X-Models-Etag`, so a refresh shows up without
 * a restart — but only while no `model_catalog_json` pins a static list. Any
 * other sign-in never fetches `/models` from a custom base URL (codex-rs
 * models-manager `should_refresh_models`, 0.153.4 through 0.165), so SKS keeps
 * binding the catalog file there, and Codex needs a restart to see a change.
 */
import http from 'node:http';
import path from 'node:path';
import { readText, writeJsonAtomic } from '../../fsx.js';
import { safeWriteCodexConfigToml } from '../../codex-runtime/codex-desktop-config-policy.js';
import { readTopLevelTomlString } from '../../codex-app/codex-model-catalog.js';
import {
  codexReadsBridgeModels,
  hasUserOwnedModelCatalog,
  setDesktopBridgeManagedModelCatalog
} from '../../../cli/install-helpers-codex-lb-config.js';
import { captureCodexAuthSnapshot } from '../desktop-auth-invariant.js';
import { desktopBridgeModelsEtag } from '../desktop-bridge/models-endpoint.js';
import type { CombinedBridgeCatalogArtifact } from '../combined-catalog.js';

export const MODEL_REFRESH_STATE_SCHEMA = 'sks.bridge-model-refresh-state.v1' as const;
/** A refresh this recent, with the same providers, already did the fetch (one `sks update` runs Doctor inside it). */
export const MODEL_REFRESH_DEBOUNCE_MS = 60_000;
export const MODEL_REFRESH_RECOVERY_COMMAND = 'sks bridge models refresh';

export interface ModelRefreshState {
  schema: typeof MODEL_REFRESH_STATE_SCHEMA;
  refreshed_at: string;
  provider_registry_generation: string;
  generation: string;
  total: number;
}

/** Where Codex reads its model list from after a refresh. */
export type CodexModelSource = 'bridge_models' | 'model_catalog_json' | 'user_model_catalog_json' | 'not_managed';

export function modelRefreshStatePath(home: string): string {
  return path.join(path.resolve(home), '.codex', 'sks', 'sks-bridge-model-refresh.json');
}

export async function readModelRefreshState(home: string): Promise<ModelRefreshState | null> {
  try {
    const parsed = JSON.parse(await readText(modelRefreshStatePath(home), '')) as Partial<ModelRefreshState>;
    return parsed?.schema === MODEL_REFRESH_STATE_SCHEMA && typeof parsed.refreshed_at === 'string'
      && typeof parsed.provider_registry_generation === 'string' && typeof parsed.generation === 'string'
      && Number.isSafeInteger(parsed.total)
      ? parsed as ModelRefreshState
      : null;
  } catch {
    return null;
  }
}

export async function writeModelRefreshState(home: string, state: Omit<ModelRefreshState, 'schema'>): Promise<void> {
  await writeJsonAtomic(modelRefreshStatePath(home), { schema: MODEL_REFRESH_STATE_SCHEMA, ...state }, { mode: 0o600 });
}

/** True when a refresh at `nowMs` would repeat one that just ran for the same providers. */
export function refreshedRecently(state: ModelRefreshState | null, registryGeneration: string, nowMs: number): boolean {
  if (!state || state.provider_registry_generation !== registryGeneration) return false;
  const age = nowMs - Date.parse(state.refreshed_at);
  return Number.isFinite(age) && age >= 0 && age < MODEL_REFRESH_DEBOUNCE_MS;
}

/** The models Codex lists in its picker (hidden rows are usable but not listed). */
export function listedModelSlugs(catalog: CombinedBridgeCatalogArtifact | null | undefined): string[] {
  if (!catalog) return [];
  return [...new Set(catalog.models
    .filter((model) => !/^hid(?:e|den)$/i.test(String(model.visibility || 'list')))
    .map((model) => String(model.slug || ''))
    .filter(Boolean))].sort();
}

export function modelListDiff(before: readonly string[], after: readonly string[]): { added: string[]; removed: string[] } {
  const was = new Set(before);
  const is = new Set(after);
  return { added: after.filter((slug) => !was.has(slug)), removed: before.filter((slug) => !is.has(slug)) };
}

export function modelRefreshLine(input: { total: number; added: number; removed: number; generation: string; restartCodex: boolean }): string {
  const line = `Model list refreshed: ${input.total} models (+${input.added} −${input.removed}) generation ${input.generation.slice(0, 8)}`;
  return input.restartCodex ? `${line}. Restart Codex to see the new model list.` : line;
}

/**
 * Asks the running bridge for `/models` and checks it serves `generation`
 * (its ETag) with every row. Returns null when it does, else why not.
 */
export async function bridgeServesModels(
  baseUrl: string,
  catalog: CombinedBridgeCatalogArtifact,
  options: { timeoutMs?: number; attempts?: number } = {}
): Promise<string | null> {
  const expected = desktopBridgeModelsEtag(catalog.generation);
  let failure: string | null = 'bridge_models_self_check_unreachable';
  for (let attempt = 0; attempt < (options.attempts ?? 3); attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 500));
    failure = await new Promise<string | null>((resolve) => {
      let url: URL;
      try { url = new URL(`${baseUrl.replace(/\/+$/, '')}/models`); } catch { resolve('bridge_models_self_check_url_invalid'); return; }
      if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)) {
        resolve('bridge_models_self_check_not_loopback');
        return;
      }
      const request = http.get(url, { timeout: options.timeoutMs ?? 3_000 }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.once('end', () => {
          if (response.statusCode !== 200) { resolve(`bridge_models_self_check_status_${response.statusCode}`); return; }
          if (response.headers.etag !== expected) { resolve('bridge_models_self_check_generation_mismatch'); return; }
          try {
            const models = (JSON.parse(Buffer.concat(chunks).toString('utf8')) as { models?: unknown }).models;
            resolve(Array.isArray(models) && models.length === catalog.models.length ? null : 'bridge_models_self_check_rows_mismatch');
          } catch {
            resolve('bridge_models_self_check_body_invalid');
          }
        });
        response.once('error', () => resolve('bridge_models_self_check_unreachable'));
      });
      request.once('timeout', () => request.destroy());
      request.once('error', () => resolve('bridge_models_self_check_unreachable'));
    });
    if (failure === null) return null;
  }
  return failure;
}

/**
 * Points Codex at the list it can follow: the bridge's `/models` for a ChatGPT
 * sign-in whose bridge serves this catalog, else the managed catalog file. A
 * user's own `model_catalog_json` is never touched. Without `allowConfigWrites`
 * nothing is written and a needed change comes back as a warning.
 */
export async function alignCodexModelSource(input: {
  home: string;
  configPath: string;
  authPath: string;
  catalog: CombinedBridgeCatalogArtifact;
  catalogPath: string | null;
  allowConfigWrites: boolean;
  selfCheck: (baseUrl: string, catalog: CombinedBridgeCatalogArtifact) => Promise<string | null>;
}): Promise<{ source: CodexModelSource; changed: boolean; warnings: string[] }> {
  const current = await readText(input.configPath, '');
  if (hasUserOwnedModelCatalog(current)) {
    return { source: 'user_model_catalog_json', changed: false, warnings: ['codex_model_list_pinned_by_user_model_catalog_json'] };
  }
  const baseUrl = readTopLevelTomlString(current, 'openai_base_url');
  if (!baseUrl || (!codexReadsBridgeModels(current) && !readTopLevelTomlString(current, 'model_catalog_json'))) {
    return { source: 'not_managed', changed: false, warnings: [] };
  }
  const auth = await captureCodexAuthSnapshot({ home: input.home, authPath: input.authPath }).catch(() => null);
  const warnings: string[] = [];
  let wantBridge = auth?.mode === 'chatgpt_oauth';
  if (wantBridge) {
    const failure = await input.selfCheck(baseUrl, input.catalog);
    if (failure) {
      warnings.push(failure);
      wantBridge = false;
    }
  }
  if (!wantBridge && !input.catalogPath) {
    return { source: codexReadsBridgeModels(current) ? 'bridge_models' : 'model_catalog_json', changed: false, warnings: [...warnings, 'codex_model_catalog_path_unavailable'] };
  }
  const next = setDesktopBridgeManagedModelCatalog(current, wantBridge ? null : input.catalogPath);
  const source: CodexModelSource = wantBridge ? 'bridge_models' : 'model_catalog_json';
  if (next === current) return { source, changed: false, warnings };
  if (!input.allowConfigWrites) {
    return {
      source: codexReadsBridgeModels(current) ? 'bridge_models' : 'model_catalog_json',
      changed: false,
      warnings: [...warnings, `codex_model_source_change_deferred:${source}`]
    };
  }
  const write = await safeWriteCodexConfigToml(input.configPath, current, next, 'desktop-bridge-model-source', { verifyUnchangedBeforeWrite: true });
  if (!write.ok) return { source: codexReadsBridgeModels(current) ? 'bridge_models' : 'model_catalog_json', changed: false, warnings: [...warnings, `codex_model_source_write_refused:${write.status}`] };
  return { source, changed: true, warnings };
}
