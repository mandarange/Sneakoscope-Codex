export const MCP_SERVER_CONFIG_SCHEMA = 'sks.mcp-server-config.v2' as const;
export const MCP_INVENTORY_SCHEMA = 'sks.mcp-inventory.v2' as const;
export const MCP_MUTATION_SCHEMA = 'sks.mcp-mutation.v2' as const;
export const MCP_HEALTH_SCHEMA = 'sks.mcp-health.v1' as const;
export const MCP_BACKUP_SCHEMA = 'sks.mcp-backup.v1' as const;

export const MCP_DEFAULT_STARTUP_TIMEOUT_SEC = 10;
export const MCP_DEFAULT_TOOL_TIMEOUT_SEC = 60;
export const MCP_APPROVAL_MODES = ['auto', 'prompt', 'writes', 'approve'] as const;

export type McpScope = 'global' | 'project' | 'effective';
export type McpWritableScope = Exclude<McpScope, 'effective'>;
export type McpTransport = 'stdio' | 'streamable-http' | 'plugin';
export type McpApprovalMode = typeof MCP_APPROVAL_MODES[number];

export interface McpServerConfigV2 {
  readonly schema: typeof MCP_SERVER_CONFIG_SCHEMA;
  readonly name: string;
  readonly scope: McpWritableScope | 'plugin';
  readonly enabled: boolean;
  readonly transport: McpTransport;
  readonly command?: string;
  readonly args?: string[];
  readonly env_vars?: string[];
  readonly cwd?: string;
  readonly experimental_environment?: 'remote';
  readonly url?: string;
  readonly bearer_token_env_var?: string;
  readonly oauth: {
    readonly supported: boolean | null;
    readonly authenticated: boolean | null;
  };
  readonly startup_timeout_sec: number;
  readonly tool_timeout_sec: number;
  readonly enabled_tools?: string[];
  readonly disabled_tools?: string[];
  readonly default_tools_approval_mode?: McpApprovalMode;
  readonly tool_approval_modes?: Readonly<Record<string, McpApprovalMode>>;
  readonly required?: boolean;
  readonly source_path: string;
  readonly managed_by: 'user' | 'sks' | 'plugin';
  readonly legacy_inline_secret_present: boolean;
  readonly legacy_env_keys: string[];
  readonly shadowed_sources?: Array<{ readonly scope: McpWritableScope | 'plugin'; readonly source_path: string }>;
}

export interface McpInventoryV2 {
  readonly schema: typeof MCP_INVENTORY_SCHEMA;
  readonly ok: boolean;
  readonly scope: McpScope;
  readonly source: 'codex_cli_and_config' | 'config_toml_static' | 'effective_merge';
  readonly servers: McpServerConfigV2[];
  readonly server_count: number;
  readonly enabled_count: number;
  readonly failed_count: number;
  readonly blockers: string[];
  readonly warnings: string[];
}

export interface McpServerMutationInput {
  readonly name: string;
  readonly transport: Exclude<McpTransport, 'plugin'>;
  readonly enabled?: boolean;
  readonly command?: string;
  readonly args?: string[];
  readonly env_vars?: string[];
  readonly cwd?: string;
  readonly experimental_environment?: 'remote';
  readonly url?: string;
  readonly bearer_token_env_var?: string;
  readonly oauth_client_id?: string;
  readonly oauth_resource?: string;
  readonly startup_timeout_sec?: number;
  readonly tool_timeout_sec?: number;
  readonly enabled_tools?: string[];
  readonly disabled_tools?: string[];
  readonly default_tools_approval_mode?: McpApprovalMode;
  readonly tool_approval_modes?: Readonly<Record<string, McpApprovalMode>>;
  readonly required?: boolean;
}

export interface McpMutationResultV2 {
  readonly schema: typeof MCP_MUTATION_SCHEMA;
  readonly ok: boolean;
  readonly action: 'add' | 'edit' | 'duplicate' | 'enable' | 'disable' | 'remove' | 'restore';
  readonly name: string | null;
  readonly scope: McpWritableScope;
  readonly changed: boolean;
  readonly official_cli_used: boolean;
  readonly fallback_used: boolean;
  readonly backup_id: string | null;
  readonly restart_required: boolean;
  readonly servers: McpServerConfigV2[];
  readonly blockers: string[];
  readonly warnings: string[];
  readonly attempts: number;
  readonly public_error: string | null;
}

export interface McpHealthResultV1 {
  readonly schema: typeof MCP_HEALTH_SCHEMA;
  readonly server: string;
  readonly scope: McpScope;
  readonly status:
    | 'healthy'
    | 'disabled'
    | 'oauth_required'
    | 'startup_failed'
    | 'timeout'
    | 'protocol_error'
    | 'unknown';
  readonly protocol_version: string | null;
  readonly tool_count: number | null;
  readonly tool_names: string[] | null;
  readonly instructions_present: boolean | null;
  readonly latency_ms: number | null;
  readonly checked_at: string;
  readonly public_error: string | null;
  readonly log_ref: string | null;
}

export interface McpBackupMetadataV1 {
  readonly schema: typeof MCP_BACKUP_SCHEMA;
  readonly id: string;
  readonly scope: McpWritableScope;
  readonly source_path: string;
  readonly sha256_before: string;
  readonly sha256_after: string | null;
  readonly created_at: string;
  readonly operation: 'add' | 'edit' | 'duplicate' | 'enable' | 'disable' | 'remove' | 'restore';
  readonly server: string;
  readonly content_file: string;
}

export interface McpScopeOptions {
  readonly home?: string;
  readonly projectRoot?: string;
  readonly projectTrusted?: boolean;
  readonly confirmProjectMutation?: boolean;
  readonly codexPath?: string;
}

export interface McpPluginServerInput {
  readonly name: string;
  readonly enabled?: boolean;
  readonly url?: string;
  readonly oauthSupported?: boolean | null;
  readonly authenticated?: boolean | null;
  readonly sourcePath?: string;
}
