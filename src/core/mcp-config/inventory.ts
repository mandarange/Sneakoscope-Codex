import { CodexMcpCliAdapter, type CodexMcpCliPort } from './codex-cli-adapter.js';
import { McpConfigReadError, publicServersFromDocument, readMcpConfigDocument } from './config-reader.js';
import { mergeEffectiveMcpServers } from './effective-merge.js';
import { redactMcpError, redactMcpUrl } from './redaction.js';
import { McpScopeError, resolveMcpScope } from './scope.js';
import {
  MCP_DEFAULT_STARTUP_TIMEOUT_SEC,
  MCP_DEFAULT_TOOL_TIMEOUT_SEC,
  MCP_INVENTORY_SCHEMA,
  MCP_SERVER_CONFIG_SCHEMA,
  type McpInventoryV2,
  type McpPluginServerInput,
  type McpScope,
  type McpScopeOptions,
  type McpServerConfigV2,
  type McpWritableScope
} from './types.js';

export interface McpInventoryOptions extends McpScopeOptions {
  readonly cli?: CodexMcpCliPort;
  readonly pluginServers?: readonly McpPluginServerInput[];
}

export async function listMcpInventory(scope: McpScope, options: McpInventoryOptions = {}): Promise<McpInventoryV2> {
  if (scope === 'effective') return effectiveInventory(options);
  return scopedInventory(scope, options);
}

export async function getMcpServer(name: string, scope: McpScope, options: McpInventoryOptions = {}): Promise<McpServerConfigV2 | null> {
  const inventory = await listMcpInventory(scope, options);
  return inventory.servers.find((server) => server.name === name) || null;
}

async function scopedInventory(scope: McpWritableScope, options: McpInventoryOptions): Promise<McpInventoryV2> {
  try {
    const ref = await resolveMcpScope(scope, options);
    const document = await readMcpConfigDocument(ref);
    const cli = options.cli ?? new CodexMcpCliAdapter({ ...(options.codexPath ? { codexPath: options.codexPath } : {}) });
    const cliResult = await cli.list(ref).catch((error: unknown) => ({ available: true, ok: false, rows: [], public_error: redactMcpError(error) }));
    const servers = publicServersFromDocument(document, cliResult.ok ? cliResult.rows : []);
    const warnings: string[] = ['changes_apply_to_new_codex_sessions'];
    if (!cliResult.available) warnings.push('codex_cli_unavailable_static_config_used');
    else if (!cliResult.ok) warnings.push('codex_cli_inventory_failed_static_config_used');
    if (servers.some((server) => server.legacy_inline_secret_present)) warnings.push('legacy_inline_secret_present');
    if (document.text.includes('default_tools_approval_mode = "deny"')) warnings.push('legacy_approval_mode_deny_unsupported');
    return inventory(scope, cliResult.ok ? 'codex_cli_and_config' : 'config_toml_static', servers, [], warnings);
  } catch (error) {
    const code = error instanceof McpConfigReadError || error instanceof McpScopeError ? error.code : 'mcp_inventory_failed';
    return inventory(scope, 'config_toml_static', [], [code], [], redactMcpError(error));
  }
}

async function effectiveInventory(options: McpInventoryOptions): Promise<McpInventoryV2> {
  const global = await scopedInventory('global', options);
  let project: McpInventoryV2 | null = null;
  if (options.projectRoot) project = await scopedInventory('project', options);
  const plugin = (options.pluginServers || []).map(pluginServer);
  const blockers = [...global.blockers, ...(project?.blockers || [])];
  const warnings = [...global.warnings, ...(project?.warnings || [])];
  const servers = mergeEffectiveMcpServers([plugin, global.servers, project?.servers || []]);
  return inventory('effective', 'effective_merge', servers, blockers, [...new Set(warnings)]);
}

function pluginServer(input: McpPluginServerInput): McpServerConfigV2 {
  return {
    schema: MCP_SERVER_CONFIG_SCHEMA,
    name: input.name,
    scope: 'plugin',
    enabled: input.enabled !== false,
    transport: 'plugin',
    ...(input.url ? { url: redactMcpUrl(input.url) } : {}),
    oauth: { supported: input.oauthSupported ?? null, authenticated: input.authenticated ?? null },
    startup_timeout_sec: MCP_DEFAULT_STARTUP_TIMEOUT_SEC,
    tool_timeout_sec: MCP_DEFAULT_TOOL_TIMEOUT_SEC,
    source_path: input.sourcePath || `plugin:${input.name}`,
    managed_by: 'plugin',
    legacy_inline_secret_present: false,
    legacy_env_keys: []
  };
}

function inventory(
  scope: McpScope,
  source: McpInventoryV2['source'],
  servers: McpServerConfigV2[],
  blockers: string[],
  warnings: string[],
  publicError?: string
): McpInventoryV2 {
  const failed = servers.filter((server) => server.oauth.authenticated === false).length;
  return {
    schema: MCP_INVENTORY_SCHEMA,
    ok: blockers.length === 0,
    scope,
    source,
    servers,
    server_count: servers.length,
    enabled_count: servers.filter((server) => server.enabled).length,
    failed_count: failed,
    blockers,
    warnings: [...new Set(warnings)],
    ...(publicError ? { warnings: [...new Set([...warnings, `public_error:${publicError}`])] } : {})
  };
}
