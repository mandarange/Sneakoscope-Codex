import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { exists, readJson, readText } from '../fsx.js';
import { CODEX_HOOK_EVENTS, codexHookEventName, type CodexHookEventName } from '../codex-compat/codex-hook-events.js';
import { matcherApplies, validateCodexCommandHookConfig } from './codex-hook-config-writer.js';
import { entriesFromHooksFile, type CodexHookTrustEntry } from './codex-hook-trust-state.js';
import { codexSourcePath, parseCodexTrustState } from './sks-hook-entries.js';

export type CodexHookActualSourceKind = 'project' | 'user';
export type CodexHookActualSourceFormat = 'hooks_json' | 'config_toml' | 'requirements_toml' | 'managed_dir_json' | 'managed_dir_toml';

export interface CodexHookActualUnsupportedHandler {
  source_path: string;
  source_kind: CodexHookActualSourceKind;
  source_format: CodexHookActualSourceFormat;
  event: string;
  group_index: number | null;
  handler_index: number | null;
  reason: string;
  hard_block: boolean;
}

export interface CodexHookActualSource {
  path: string;
  source_kind: CodexHookActualSourceKind;
  source_format: CodexHookActualSourceFormat;
  exists: boolean;
  inline_hooks: boolean;
  managed: boolean;
}

export interface CodexHookActualState {
  schema: 'sks.codex-hook-actual-state.v1';
  ok: boolean;
  root: string;
  sources: CodexHookActualSource[];
  managed_dirs: string[];
  entries: CodexHookTrustEntry[];
  unsupported_handlers: CodexHookActualUnsupportedHandler[];
  invalid_matchers: CodexHookActualUnsupportedHandler[];
  dual_representation: Array<{ source_kind: CodexHookActualSourceKind; hooks_json: string; config_toml: string }>;
  warnings: string[];
  blockers: string[];
}

type TomlGroup = {
  event: CodexHookEventName;
  matcher: string | null;
  hooks: any[];
};

export async function readCodexHookActualState(root: string): Promise<CodexHookActualState> {
  // Mirrors what Codex loads (checked through 0.158 with app-server
  // hooks/list): the user layer for every project, the project layer only
  // for a trusted project, and hook trust only from the user config.toml.
  // requirements.toml under $CODEX_HOME or a project is never a hook source,
  // and its allow_managed_hooks_only has no effect there.
  const codexHome = path.resolve(process.env.CODEX_HOME || path.join(process.env.HOME || os.homedir(), '.codex'));
  const userConfigText = String(await readText(path.join(codexHome, 'config.toml'), '') || '');
  const trust = parseCodexTrustState(userConfigText);
  const projectRoot = path.resolve(root);
  const projectTrusted = trust.trustedProjects.has(projectRoot)
    || trust.trustedProjects.has(await fs.realpath(projectRoot).catch(() => projectRoot));
  const configs = [
    {
      source_kind: 'project' as const,
      hooks_json: path.join(projectRoot, '.codex', 'hooks.json'),
      config_toml: path.join(projectRoot, '.codex', 'config.toml'),
      requirements_toml: path.join(projectRoot, '.codex', 'requirements.toml'),
      loaded: projectTrusted
    },
    {
      source_kind: 'user' as const,
      hooks_json: path.join(codexHome, 'hooks.json'),
      config_toml: path.join(codexHome, 'config.toml'),
      requirements_toml: path.join(codexHome, 'requirements.toml'),
      loaded: true
    }
  ];
  const sources: CodexHookActualSource[] = [];
  const entries: CodexHookTrustEntry[] = [];
  const unsupportedHandlers: CodexHookActualUnsupportedHandler[] = [];
  const invalidMatchers: CodexHookActualUnsupportedHandler[] = [];
  const dualRepresentation: Array<{ source_kind: CodexHookActualSourceKind; hooks_json: string; config_toml: string }> = [];
  const notices: string[] = [];

  for (const cfg of configs) {
    const hooksJsonExists = await exists(cfg.hooks_json);
    const configText = String(await readText(cfg.config_toml, '') || '');
    const requirementsText = String(await readText(cfg.requirements_toml, '') || '');
    const configHasInlineHooks = hasInlineHookTables(configText);
    sources.push({ path: cfg.hooks_json, source_kind: cfg.source_kind, source_format: 'hooks_json', exists: hooksJsonExists, inline_hooks: false, managed: false });
    sources.push({ path: cfg.config_toml, source_kind: cfg.source_kind, source_format: 'config_toml', exists: Boolean(configText.trim()), inline_hooks: configHasInlineHooks, managed: false });
    sources.push({ path: cfg.requirements_toml, source_kind: cfg.source_kind, source_format: 'requirements_toml', exists: Boolean(requirementsText.trim()), inline_hooks: hasInlineHookTables(requirementsText), managed: false });
    if (/^\s*(?:managed_dir|windows_managed_dir)\s*=|^\s*\[\[hooks\./m.test(requirementsText)) notices.push(`codex_ignores_requirements_toml_hooks:${cfg.requirements_toml}`);
    if (!cfg.loaded) {
      if (hooksJsonExists || configHasInlineHooks) notices.push(`project_hooks_not_loaded_untrusted_project:${projectRoot}`);
      continue;
    }
    if (hooksJsonExists) {
      const hooks = await readJson(cfg.hooks_json, {});
      entries.push(...tagEntries(entriesFromHooksFile(await codexSourcePath(cfg.hooks_json), cfg.source_kind, hooks, trust.trustedHashes, false), 'hooks_json', false));
      unsupportedHandlers.push(...analyzeHooksJsonUnsupported(cfg.hooks_json, cfg.source_kind, hooks, 'hooks_json'));
    }
    if (configHasInlineHooks) {
      const parsed = entriesFromInlineHooksToml(await codexSourcePath(cfg.config_toml), cfg.source_kind, configText, trust.trustedHashes, false, 'config_toml');
      entries.push(...parsed.entries);
      unsupportedHandlers.push(...parsed.unsupported_handlers);
      invalidMatchers.push(...parsed.invalid_matchers);
      if (hooksJsonExists) dualRepresentation.push({ source_kind: cfg.source_kind, hooks_json: cfg.hooks_json, config_toml: cfg.config_toml });
    }
  }

  const asyncEntries = entries.filter((entry) => entry.async === true).map((entry) => ({
    source_path: entry.source_path,
    source_kind: entry.source_kind,
    source_format: (entry as any).source_format || 'hooks_json',
    event: entry.event,
    group_index: entry.group_index,
    handler_index: entry.handler_index,
    reason: 'async_command_hooks_are_not_supported_by_sks',
    hard_block: true
  }));
  unsupportedHandlers.push(...asyncEntries);
  const hardBlockers = [
    ...unsupportedHandlers.filter((item) => item.hard_block).map((item) => `${item.reason}:${item.source_path}`),
    ...invalidMatchers.map((item) => `${item.reason}:${item.source_path}`),
    ...dualRepresentation.map((item) => `dual_hook_representation:${item.source_kind}`)
  ];
  return {
    schema: 'sks.codex-hook-actual-state.v1',
    ok: hardBlockers.length === 0,
    root,
    sources,
    managed_dirs: [],
    entries,
    unsupported_handlers: unsupportedHandlers,
    invalid_matchers: invalidMatchers,
    dual_representation: dualRepresentation,
    warnings: [...new Set([...hardBlockers, ...notices, ...entries.flatMap((entry) => entry.warnings || [])])],
    blockers: [...new Set(hardBlockers)]
  };
}

export function entriesFromInlineHooksToml(
  sourcePath: string,
  sourceKind: CodexHookActualSourceKind,
  tomlText: string,
  trustedHashes: Record<string, string> = {},
  managed = false,
  sourceFormat: CodexHookActualSourceFormat = 'config_toml'
) {
  const hooksJson = { hooks: hooksObjectFromToml(String(tomlText || ''), sourcePath, sourceKind, sourceFormat) };
  const entries = tagEntries(entriesFromHooksFile(sourcePath, sourceKind, hooksJson, trustedHashes, managed), sourceFormat, managed);
  const unsupportedHandlers = analyzeHooksJsonUnsupported(sourcePath, sourceKind, hooksJson, sourceFormat);
  const invalidMatchers = unsupportedHandlers.filter((item) => item.reason === 'invalid_matcher');
  return { entries, unsupported_handlers: unsupportedHandlers, invalid_matchers: invalidMatchers };
}

export function hasInlineHookTables(tomlText: string): boolean {
  return /^\s*\[\[hooks\.[A-Za-z]+(?:\.hooks)?\]\]\s*$/m.test(String(tomlText || ''));
}

function hooksObjectFromToml(tomlText: string, sourcePath: string, sourceKind: CodexHookActualSourceKind, sourceFormat: CodexHookActualSourceFormat) {
  const hooks: Record<string, TomlGroup[]> = {};
  let currentGroup: TomlGroup | null = null;
  let currentHandler: any | null = null;
  for (const rawLine of String(tomlText || '').split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    const groupHeader = line.match(/^\[\[hooks\.([A-Za-z]+)\]\]$/);
    if (groupHeader?.[1]) {
      const event = codexHookEventName(groupHeader[1]);
      if (!event) {
        currentGroup = null;
        currentHandler = null;
        continue;
      }
      currentGroup = { event, matcher: null, hooks: [] };
      currentHandler = null;
      hooks[event] = [...(hooks[event] || []), currentGroup];
      continue;
    }
    const handlerHeader = line.match(/^\[\[hooks\.([A-Za-z]+)\.hooks\]\]$/);
    if (handlerHeader?.[1]) {
      const event = codexHookEventName(handlerHeader[1]);
      if (!event) {
        currentGroup = null;
        currentHandler = null;
        continue;
      }
      if (!currentGroup || currentGroup.event !== event) {
        currentGroup = { event, matcher: null, hooks: [] };
        hooks[event] = [...(hooks[event] || []), currentGroup];
      }
      currentHandler = {};
      currentGroup.hooks.push(currentHandler);
      continue;
    }
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (!kv?.[1] || !kv[2]) continue;
    const key = kv[1] === 'command_windows' ? 'commandWindows' : kv[1];
    const value = parseTomlValue(kv[2]);
    if (currentHandler) {
      currentHandler[key] = value;
    } else if (currentGroup && key === 'matcher') {
      currentGroup.matcher = typeof value === 'string' ? value : null;
    } else if (currentGroup && key === 'hooks' && Array.isArray(value)) {
      currentGroup.hooks.push(...value);
    } else {
      void sourcePath;
      void sourceKind;
      void sourceFormat;
    }
  }
  return hooks;
}

function analyzeHooksJsonUnsupported(
  sourcePath: string,
  sourceKind: CodexHookActualSourceKind,
  hooksFile: any,
  sourceFormat: CodexHookActualSourceFormat
): CodexHookActualUnsupportedHandler[] {
  const issues: CodexHookActualUnsupportedHandler[] = [];
  const hooksRoot = hooksFile?.hooks && typeof hooksFile.hooks === 'object' && !Array.isArray(hooksFile.hooks) ? hooksFile.hooks : {};
  for (const key of Object.keys(hooksRoot)) {
    if (!CODEX_HOOK_EVENTS.includes(key as CodexHookEventName)) {
      issues.push({ source_path: sourcePath, source_kind: sourceKind, source_format: sourceFormat, event: key, group_index: null, handler_index: null, reason: 'unsupported_event', hard_block: true });
    }
  }
  for (const event of CODEX_HOOK_EVENTS) {
    const groups = Array.isArray(hooksRoot[event]) ? hooksRoot[event] : [];
    groups.forEach((group: any, groupIndex: number) => {
      const matcher = typeof group?.matcher === 'string' ? group.matcher : null;
      if (matcher != null && (!matcherApplies(event) || validateCodexCommandHookConfig({ event, matcher, command: 'sks hook noop' }).includes('invalid_matcher'))) {
        issues.push({ source_path: sourcePath, source_kind: sourceKind, source_format: sourceFormat, event, group_index: groupIndex, handler_index: null, reason: matcherApplies(event) ? 'invalid_matcher' : 'matcher_not_applicable', hard_block: true });
      }
      const handlers = Array.isArray(group?.hooks) ? group.hooks : [];
      if (handlers.length === 0) {
        issues.push({ source_path: sourcePath, source_kind: sourceKind, source_format: sourceFormat, event, group_index: groupIndex, handler_index: null, reason: 'empty_hook_group', hard_block: true });
      }
      handlers.forEach((handler: any, handlerIndex: number) => {
        if (!handler || typeof handler !== 'object') {
          issues.push({ source_path: sourcePath, source_kind: sourceKind, source_format: sourceFormat, event, group_index: groupIndex, handler_index: handlerIndex, reason: 'invalid_handler_shape', hard_block: true });
          return;
        }
        if (handler.type !== 'command') {
          issues.push({ source_path: sourcePath, source_kind: sourceKind, source_format: sourceFormat, event, group_index: groupIndex, handler_index: handlerIndex, reason: `unsupported_handler_type:${String(handler.type || 'missing')}`, hard_block: true });
        }
        if (handler.type === 'command' && !String(handler.command || '').trim()) {
          issues.push({ source_path: sourcePath, source_kind: sourceKind, source_format: sourceFormat, event, group_index: groupIndex, handler_index: handlerIndex, reason: 'empty_command', hard_block: true });
        }
        if (handler.async === true) {
          issues.push({ source_path: sourcePath, source_kind: sourceKind, source_format: sourceFormat, event, group_index: groupIndex, handler_index: handlerIndex, reason: 'async_command_hooks_are_not_supported_by_sks', hard_block: true });
        }
      });
    });
  }
  return issues;
}

function tagEntries(entries: CodexHookTrustEntry[], sourceFormat: CodexHookActualSourceFormat, managed: boolean) {
  return entries.map((entry) => ({
    ...entry,
    source_format: sourceFormat,
    managed,
    trust_status: managed ? 'Managed' as const : entry.trust_status,
    repair_action: managed ? null : entry.repair_action,
    warnings: managed ? [] : entry.warnings
  }));
}

function stripTomlComment(line: string): string {
  let inString = false;
  let escaped = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (ch === '#' && !inString) return line.slice(0, i);
  }
  return line;
}

function parseTomlValue(raw: string): unknown {
  const value = raw.trim().replace(/,$/, '');
  if (/^".*"$/.test(value)) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (/^\[.*\]$/.test(value)) {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  return value;
}
