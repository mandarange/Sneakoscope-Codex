import { readTopLevelTomlString } from '../../codex-app/codex-model-catalog.js';
import {
  removeTopLevelTomlKeyIfValue,
  safeWriteCodexConfigToml,
  upsertTopLevelTomlString
} from '../../codex-runtime/codex-desktop-config-policy.js';
import { exists, readText } from '../../fsx.js';
import {
  defaultSubagentEntry,
  type OpenRouterOnlyRestore,
  type OpenRouterOnlyState
} from '../../subagents/child-model-allowlist.js';
import type { BridgeRouteIndex } from '../bridge-contracts.js';
import { canonicalizeBridgeModelId } from '../route-index.js';
import { hasOpenRouterRoute } from './openrouter-only-catalog.js';
import type { ControllerPaths, DesktopBridgeControllerV3Options } from './types.js';

/**
 * The main thread's model while OpenRouter Only Mode is on.
 *
 * Turning the mode on points `model =` in ~/.codex/config.toml at the default
 * list entry when the configured model is not an OpenRouter model in the new
 * catalog, and records what it replaced. Turning it off puts that value back —
 * but only while the config still names the model SKS wrote, so a model the
 * user picked in the meantime is never overwritten.
 *
 * Every write goes through the guarded config writer and is a plain
 * `model = "..."` line: an SKS comment on or above the model line makes the
 * guard's mode-lock provenance scan strip the line on the next write.
 */
export interface OpenRouterOnlyMainModelChange {
  changed: boolean;
  /** 'kept_openrouter' | 'applied' | 'restored' | 'removed' | 'user_changed' | 'no_record' | 'blocked' */
  action: string;
  previous_model: string | null;
  model: string | null;
  write_status: string | null;
  blockers: string[];
}

const MAIN_MODEL_WRITE_CAUSE = 'openrouter-only-main-model';

/** TOML basic-string body: the only characters that must be escaped. */
function tomlBasicStringBody(value: string): string {
  return value.replace(/[\\"\u0000-\u001f\u007f]/g, (character) => character === '\\'
    ? '\\\\'
    : character === '"' ? '\\"' : `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** The default entry when OpenRouter routes it, else the first listed entry it routes. */
export function openRouterOnlyMainModelTarget(
  state: OpenRouterOnlyState,
  routeIndex: Pick<BridgeRouteIndex, 'routes'> | null
): string | null {
  const preferred = defaultSubagentEntry(state);
  const ordered = [...(preferred ? [preferred] : []), ...state.subagent_models.filter((entry) => entry !== preferred)];
  for (const entry of ordered) {
    if (hasOpenRouterRoute(routeIndex, entry.model)) return canonicalizeBridgeModelId(entry.model);
  }
  return null;
}

async function writeModelLine(
  paths: Pick<ControllerPaths, 'configPath'>,
  before: string,
  next: string,
  expected: string | null,
  options: DesktopBridgeControllerV3Options
): Promise<{ ok: boolean; status: string; blockers: string[] }> {
  const write = await (options.safeWriteConfigImpl || safeWriteCodexConfigToml)(
    paths.configPath,
    before,
    next,
    MAIN_MODEL_WRITE_CAUSE,
    { verifyUnchangedBeforeWrite: true, expectedBeforeExists: await exists(paths.configPath) }
  );
  if (!write.ok) return { ok: false, status: write.status, blockers: [`openrouter_only_main_model_write_${write.status}`] };
  const after = write.expected_after?.text ?? next;
  if (readTopLevelTomlString(after, 'model') !== expected) {
    return { ok: false, status: write.status, blockers: ['openrouter_only_main_model_write_not_applied'] };
  }
  return { ok: true, status: write.status, blockers: [] };
}

function topLevelModelLinePresent(text: string): boolean {
  const lines = text.split('\n');
  const firstTable = lines.findIndex((line) => /^\s*\[.+\]\s*$/.test(line));
  return lines.slice(0, firstTable === -1 ? lines.length : firstTable).some((line) => /^\s*model\s*=/.test(line));
}

export async function applyOpenRouterOnlyMainModel(
  paths: Pick<ControllerPaths, 'configPath'>,
  state: OpenRouterOnlyState,
  routeIndex: Pick<BridgeRouteIndex, 'routes'> | null,
  options: DesktopBridgeControllerV3Options
): Promise<{ change: OpenRouterOnlyMainModelChange; restore: OpenRouterOnlyRestore | null }> {
  const before = String(await readText(paths.configPath, ''));
  const current = readTopLevelTomlString(before, 'model');
  // A model line SKS cannot read (e.g. a TOML literal string) could not be put
  // back on OFF, so it is never overwritten.
  if (current === null && topLevelModelLinePresent(before)) {
    return {
      change: {
        changed: false, action: 'blocked', previous_model: null, model: null, write_status: null,
        blockers: ['openrouter_only_main_model_unparsed']
      },
      restore: state.restore
    };
  }
  if (hasOpenRouterRoute(routeIndex, current)) {
    return {
      change: { changed: false, action: 'kept_openrouter', previous_model: current, model: current, write_status: null, blockers: [] },
      restore: state.restore
    };
  }
  const target = openRouterOnlyMainModelTarget(state, routeIndex);
  if (!target) {
    return {
      change: {
        changed: false, action: 'blocked', previous_model: current, model: current, write_status: null,
        blockers: ['openrouter_only_main_model_not_openrouter']
      },
      restore: state.restore
    };
  }
  const written = await writeModelLine(paths, before, upsertTopLevelTomlString(before, 'model', tomlBasicStringBody(target)), target, options);
  if (!written.ok) {
    return {
      change: { changed: false, action: 'blocked', previous_model: current, model: current, write_status: written.status, blockers: written.blockers },
      restore: state.restore
    };
  }
  return {
    change: { changed: true, action: 'applied', previous_model: current, model: target, write_status: written.status, blockers: [] },
    restore: { previous_model: current, applied_model: target }
  };
}

export async function restoreOpenRouterOnlyMainModel(
  paths: Pick<ControllerPaths, 'configPath'>,
  restore: OpenRouterOnlyRestore | null,
  options: DesktopBridgeControllerV3Options
): Promise<OpenRouterOnlyMainModelChange> {
  const before = String(await readText(paths.configPath, ''));
  const current = readTopLevelTomlString(before, 'model');
  const unchanged = (action: string): OpenRouterOnlyMainModelChange => (
    { changed: false, action, previous_model: current, model: current, write_status: null, blockers: [] }
  );
  if (!restore?.applied_model) return unchanged('no_record');
  if (current !== restore.applied_model) return unchanged('user_changed');
  const previous = restore.previous_model;
  const next = previous === null
    ? removeTopLevelTomlKeyIfValue(before, 'model', restore.applied_model)
    : upsertTopLevelTomlString(before, 'model', tomlBasicStringBody(previous));
  const written = await writeModelLine(paths, before, next, previous, options);
  if (!written.ok) {
    return { changed: false, action: 'blocked', previous_model: current, model: current, write_status: written.status, blockers: written.blockers };
  }
  return {
    changed: true,
    action: previous === null ? 'removed' : 'restored',
    previous_model: current,
    model: previous,
    write_status: written.status,
    blockers: []
  };
}
