import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, nowIso, writeJsonAtomic, writeTextAtomic } from '../fsx.js';
import { CONTEXT7_REMOTE_MCP_URL, mcpServerBlock, mcpServerExplicitlyDisabled, readProjectCodexConfig, replaceOrAppendMcpServerBlock } from '../mcp/mcp-config-preservation.js';

export interface Context7McpRepairReport {
  schema: 'sks.doctor-context7-mcp-repair.v1';
  generated_at: string;
  ok: boolean;
  apply: boolean;
  config_path: string;
  before_transport: 'missing' | 'stdio' | 'remote' | 'disabled' | 'unknown';
  after_transport: 'missing' | 'stdio' | 'remote' | 'disabled' | 'unknown';
  repaired: boolean;
  manual_required: boolean;
  blockers: string[];
  warnings: string[];
}

export async function repairContext7Mcp(input: { root: string; apply?: boolean; reportPath?: string | null }): Promise<Context7McpRepairReport> {
  const root = path.resolve(input.root);
  const config = await readProjectCodexConfig(root);
  const beforeTransport = classifyContext7Transport(config.text);
  let afterText = config.text;
  let repaired = false;
  if (beforeTransport === 'stdio') {
    afterText = replaceOrAppendMcpServerBlock(config.text, 'context7', [
      '[mcp_servers.context7]',
      `url = "${CONTEXT7_REMOTE_MCP_URL}"`,
      ''
    ].join('\n'));
    repaired = afterText !== config.text;
  }
  if (input.apply && repaired) {
    await ensureDir(path.dirname(config.path));
    await fs.writeFile(`${config.path}.context7-mcp-repair-${Date.now().toString(36)}.bak`, config.text, 'utf8').catch(() => undefined);
    await writeTextAtomic(config.path, afterText);
  }
  const after = input.apply && repaired ? await readProjectCodexConfig(root) : { text: afterText };
  const afterTransport = classifyContext7Transport(after.text);
  const report: Context7McpRepairReport = {
    schema: 'sks.doctor-context7-mcp-repair.v1',
    generated_at: nowIso(),
    ok: afterTransport === 'remote' || afterTransport === 'disabled' || beforeTransport === 'missing',
    apply: input.apply === true,
    config_path: config.path,
    before_transport: beforeTransport,
    after_transport: afterTransport,
    repaired: input.apply === true && repaired,
    manual_required: false,
    blockers: afterTransport === 'stdio' ? ['context7_mcp_still_stdio'] : [],
    warnings: beforeTransport === 'missing' ? ['context7_mcp_not_configured'] : []
  };
  if (input.reportPath !== null) await writeJsonAtomic(input.reportPath || path.join(root, '.sneakoscope', 'reports', 'doctor-context7-mcp-repair.json'), report).catch(() => undefined);
  return report;
}

export function classifyContext7Transport(text: string): Context7McpRepairReport['before_transport'] {
  if (mcpServerExplicitlyDisabled(text, 'context7')) return 'disabled';
  const block = mcpServerBlock(text, 'context7');
  if (!block) return 'missing';
  if (/^\s*url\s*=/m.test(block)) return 'remote';
  if (/^\s*command\s*=|stdio|npx|context7/i.test(block)) return 'stdio';
  return 'unknown';
}
