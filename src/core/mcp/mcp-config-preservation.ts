import fs from 'node:fs/promises';
import path from 'node:path';

export const CONTEXT7_REMOTE_MCP_URL = 'https://mcp.context7.com/mcp';

export async function readProjectCodexConfig(root: string): Promise<{ path: string; text: string }> {
  const file = path.join(path.resolve(root), '.codex', 'config.toml');
  const text = await fs.readFile(file, 'utf8').catch(() => '');
  return { path: file, text };
}

export function mcpServerBlock(text: string, serverName: string): string | null {
  const range = tomlTableRange(text, `mcp_servers.${serverName}`, false);
  return range ? String(text || '').slice(range.start, range.end) : null;
}

export function mcpServerBlockWithChildren(text: string, serverName: string): string | null {
  const range = tomlTableRange(text, `mcp_servers.${serverName}`, true);
  return range ? String(text || '').slice(range.start, range.end) : null;
}

export function mcpServerExplicitlyDisabled(text: string, serverName: string): boolean {
  const block = mcpServerBlock(text, serverName);
  return Boolean(block && /^\s*disabled\s*=\s*true\s*$/m.test(block));
}

export function replaceOrAppendMcpServerBlock(text: string, serverName: string, block: string): string {
  const normalizedBlock = block.endsWith('\n') ? block : `${block}\n`;
  const range = tomlTableRange(text, `mcp_servers.${serverName}`, true);
  if (range) return `${text.slice(0, range.start)}${normalizedBlock}${text.slice(range.end).replace(/^\n+/, '')}`;
  const prefix = text.trim() ? `${text.replace(/\s*$/, '\n\n')}` : '';
  return `${prefix}${normalizedBlock}`;
}

export function removeMcpServerBlock(text: string, serverName: string): string {
  const range = tomlTableRange(text, `mcp_servers.${serverName}`, true);
  if (!range) return text;
  return `${text.slice(0, range.start).trimEnd()}${range.start > 0 ? '\n\n' : ''}${text.slice(range.end).replace(/^\n+/, '')}`;
}

export function redactedMcpText(text: string): string {
  return String(text || '').replace(/(token|access_token|api_key|secret)\s*=\s*"[^"]*"/gi, '$1 = "<redacted>"');
}

export function tomlTableRange(text: string, table: string, includeChildren: boolean): { start: number; end: number } | null {
  const source = String(text || '');
  const escaped = table.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const header = new RegExp(`(^|\\n)\\s*\\[${escaped}\\]\\s*(?:#.*)?(?:\\n|$)`, 'g');
  const match = header.exec(source);
  if (!match) return null;
  const start = Number(match.index || 0) + (match[1] ? 1 : 0);
  const rest = source.slice(header.lastIndex);
  const nextHeader = includeChildren
    ? rest.search(new RegExp(`\\n\\s*\\[(?!${escaped}(?:\\.|\\]))[^\\]]+\\]\\s*(?:#.*)?(?:\\n|$)`))
    : rest.search(/\n\s*\[[^\]]+\]\s*(?:#.*)?(?:\n|$)/);
  const end = nextHeader >= 0 ? header.lastIndex + nextHeader : source.length;
  return { start, end };
}
