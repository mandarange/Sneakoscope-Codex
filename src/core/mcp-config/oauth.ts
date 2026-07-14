import { CodexMcpCliAdapter, type CodexMcpCliPort } from './codex-cli-adapter.js';
import { rawServer, readMcpConfigDocument } from './config-reader.js';
import { redactMcpError } from './redaction.js';
import { normalizeMcpServerName } from './secret-policy.js';
import { McpScopeError, resolveMcpScope } from './scope.js';
import type { McpScopeOptions, McpWritableScope } from './types.js';

export interface McpOAuthOptions extends McpScopeOptions {
  readonly cli?: CodexMcpCliPort;
}

export interface McpOAuthResultV1 {
  readonly schema: 'sks.mcp-oauth.v1';
  readonly ok: boolean;
  readonly action: 'login' | 'logout';
  readonly server: string | null;
  readonly scope: McpWritableScope;
  readonly authenticated: boolean | null;
  readonly blockers: string[];
  readonly public_error: string | null;
}

export async function loginMcpServer(
  nameInput: unknown,
  scope: McpWritableScope,
  options: McpOAuthOptions = {},
  scopes: readonly string[] = []
): Promise<McpOAuthResultV1> {
  return auth('login', nameInput, scope, options, scopes);
}

export async function logoutMcpServer(
  nameInput: unknown,
  scope: McpWritableScope,
  options: McpOAuthOptions = {}
): Promise<McpOAuthResultV1> {
  return auth('logout', nameInput, scope, options, []);
}

async function auth(
  action: 'login' | 'logout',
  nameInput: unknown,
  scope: McpWritableScope,
  options: McpOAuthOptions,
  scopes: readonly string[]
): Promise<McpOAuthResultV1> {
  const name = normalizeMcpServerName(nameInput);
  if (!name) return failure(action, null, scope, ['invalid_mcp_server_name']);
  try {
    const ref = await resolveMcpScope(scope, options);
    const document = await readMcpConfigDocument(ref);
    const server = rawServer(document, name);
    if (!server) return failure(action, name, scope, ['mcp_server_not_found']);
    if (typeof server.url !== 'string') return failure(action, name, scope, ['mcp_oauth_requires_http_transport']);
    const cli = options.cli ?? new CodexMcpCliAdapter({ ...(options.codexPath ? { codexPath: options.codexPath } : {}) });
    const outcome = action === 'login' ? await cli.login(ref, name, scopes) : await cli.logout(ref, name);
    if (!outcome.available) return failure(action, name, scope, ['codex_cli_not_found'], outcome.public_error);
    if (!outcome.ok) return failure(action, name, scope, [`mcp_oauth_${action}_failed`], outcome.public_error);
    return {
      schema: 'sks.mcp-oauth.v1', ok: true, action, server: name, scope,
      authenticated: action === 'login', blockers: [], public_error: null
    };
  } catch (error) {
    return failure(action, name, scope, [error instanceof McpScopeError ? error.code : `mcp_oauth_${action}_failed`], redactMcpError(error));
  }
}

function failure(
  action: 'login' | 'logout',
  server: string | null,
  scope: McpWritableScope,
  blockers: string[],
  publicError: string | null = null
): McpOAuthResultV1 {
  return {
    schema: 'sks.mcp-oauth.v1', ok: false, action, server, scope,
    authenticated: null, blockers, public_error: publicError
  };
}
