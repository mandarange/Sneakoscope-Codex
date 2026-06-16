import fs from 'node:fs/promises';
import path from 'node:path';

export const CONTEXT7_REMOTE_MCP_URL = 'https://mcp.context7.com/mcp';

export async function readProjectCodexConfig(root: string): Promise<{ path: string; text: string }> {
  const file = path.join(path.resolve(root), '.codex', 'config.toml');
  const text = await fs.readFile(file, 'utf8').catch(() => '');
  return { path: file, text };
}

export function mcpServerBlock(text: string, serverName: string): string | null {
  const escaped = serverName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^\\[mcp_servers\\.${escaped}\\]\\n[\\s\\S]*?)(?=^\\[|(?![\\s\\S]))`, 'm');
  return String(text || '').match(re)?.[1] || null;
}

export function mcpServerExplicitlyDisabled(text: string, serverName: string): boolean {
  const block = mcpServerBlock(text, serverName);
  return Boolean(block && /^\s*disabled\s*=\s*true\s*$/m.test(block));
}

export function replaceOrAppendMcpServerBlock(text: string, serverName: string, block: string): string {
  const escaped = serverName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const normalizedBlock = block.endsWith('\n') ? block : `${block}\n`;
  const re = new RegExp(`(^\\[mcp_servers\\.${escaped}\\]\\n[\\s\\S]*?)(?=^\\[|(?![\\s\\S]))`, 'm');
  if (re.test(text)) return text.replace(re, normalizedBlock);
  const prefix = text.trim() ? `${text.replace(/\s*$/, '\n\n')}` : '';
  return `${prefix}${normalizedBlock}`;
}

export function redactedMcpText(text: string): string {
  return String(text || '').replace(/(token|access_token|api_key|secret)\s*=\s*"[^"]*"/gi, '$1 = "<redacted>"');
}
