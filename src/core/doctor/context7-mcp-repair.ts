import path from 'node:path';
import { ensureDir, nowIso, writeJsonAtomic, writeTextAtomic } from '../fsx.js';
import { CONTEXT7_REMOTE_MCP_URL, mcpServerBlock, mcpServerExplicitlyDisabled, readProjectCodexConfig, replaceOrAppendMcpServerBlock } from '../mcp/mcp-config-preservation.js';
import { guardedWriteFile, guardContextForRoute } from '../safety/mutation-guard.js';
import { createRequestedScopeContract } from '../safety/requested-scope-contract.js';

export interface Context7McpRepairReport {
  schema: 'sks.doctor-context7-mcp-repair.v1';
  generated_at: string;
  ok: boolean;
  apply: boolean;
  config_path: string;
  before_transport: 'missing' | 'stdio' | 'remote' | 'disabled' | 'unknown';
  after_transport: 'missing' | 'stdio' | 'remote' | 'disabled' | 'unknown';
  disabled_preserved: boolean;
  remote_probe_status: 'skipped' | 'ok' | 'failed';
  repaired: boolean;
  manual_required: boolean;
  blockers: string[];
  warnings: string[];
}

export async function repairContext7Mcp(input: { root: string; apply?: boolean; reportPath?: string | null }): Promise<Context7McpRepairReport> {
  const root = path.resolve(input.root);
  const config = await readProjectCodexConfig(root);
  const beforeTransport = classifyContext7Transport(config.text);
  const disabledPreserved = beforeTransport === 'disabled';
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
    const backupPath = `${config.path}.context7-mcp-repair-${Date.now().toString(36)}.bak`;
    const contract = createRequestedScopeContract({
      route: '$Team',
      userRequest: 'Write a scoped project backup before doctor Context7 MCP repair.',
      projectRoot: root
    });
    await guardedWriteFile(guardContextForRoute(root, contract, 'doctor Context7 MCP repair backup'), backupPath, config.text).catch(() => undefined);
    await writeTextAtomic(config.path, afterText);
  }
  const after = input.apply && repaired ? await readProjectCodexConfig(root) : { text: afterText };
  const afterTransport = classifyContext7Transport(after.text);
  const remoteProbeStatus = afterTransport === 'remote' && process.env.SKS_CONTEXT7_REMOTE_PROBE === '1'
    ? await probeRemoteContext7()
    : 'skipped';
  const report: Context7McpRepairReport = {
    schema: 'sks.doctor-context7-mcp-repair.v1',
    generated_at: nowIso(),
    ok: afterTransport === 'remote' || afterTransport === 'disabled' || beforeTransport === 'missing',
    apply: input.apply === true,
    config_path: config.path,
    before_transport: beforeTransport,
    after_transport: afterTransport,
    disabled_preserved: disabledPreserved && afterTransport === 'disabled',
    remote_probe_status: remoteProbeStatus,
    repaired: input.apply === true && repaired,
    manual_required: false,
    blockers: afterTransport === 'stdio' ? ['context7_mcp_still_stdio'] : [],
    warnings: beforeTransport === 'missing' ? ['context7_mcp_not_configured'] : []
  };
  if (input.reportPath !== null) await writeJsonAtomic(input.reportPath || path.join(root, '.sneakoscope', 'reports', 'doctor-context7-mcp-repair.json'), report).catch(() => undefined);
  return report;
}

async function probeRemoteContext7(): Promise<Context7McpRepairReport['remote_probe_status']> {
  try {
    const response = await fetch(CONTEXT7_REMOTE_MCP_URL, { method: 'HEAD' });
    return response.status < 500 ? 'ok' : 'failed';
  } catch {
    return 'failed';
  }
}

export function classifyContext7Transport(text: string): Context7McpRepairReport['before_transport'] {
  if (mcpServerExplicitlyDisabled(text, 'context7')) return 'disabled';
  const block = mcpServerBlock(text, 'context7');
  if (!block) return 'missing';
  if (/^\s*url\s*=/m.test(block)) return 'remote';
  if (/^\s*command\s*=|stdio|npx|context7/i.test(block)) return 'stdio';
  return 'unknown';
}
