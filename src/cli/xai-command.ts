import path from 'node:path';
import { ensureDir, projectRoot, readText, runProcess, sksRoot, writeTextAtomic } from '../core/fsx.js';
import { getCodexInfo } from '../core/codex-adapter.js';
import { detectXaiMcp } from '../core/mcp/xai-mcp-detector.js';

// `sks xai` — wire up xAI/Grok web search (Live Search) as a Codex MCP server so
// SKS source-intelligence can fan out to Grok alongside Context7 and Codex web
// search. SKS detects xAI via an MCP server whose name matches xai/grok/x-ai and
// that exposes a search/web/query tool (see core/mcp/xai-mcp-detector.ts), so
// `setup` registers that MCP server and points the operator at XAI_API_KEY.
//
// xAI reference (https://api.x.ai/v1): OpenAI-compatible Responses API with the
// `web_search` / `x_search` tools, model family `grok-4.x`, auth via XAI_API_KEY.

const XAI_DOCS_URL = 'https://docs.x.ai/developers/tools/web-search';
const XAI_API_BASE = 'https://api.x.ai/v1';
const DEFAULT_SERVER_NAME = 'grok-search';

const flag = (args: string[], name: string) => args.includes(name);

export async function xaiCommand(sub: string = 'check', args: string[] = []) {
  const action = sub || 'check';
  if (action === 'check' || action === 'status') return xaiCheck(args);
  if (action === 'setup') return xaiSetup(args);
  if (action === 'docs' || action === 'help' || action === '--help' || action === '-h') return xaiDocs(args);
  throw new Error(`Unknown xai command: ${action}. Use: sks xai check | setup | status | docs`);
}

async function xaiCheck(args: string[]) {
  const root = await projectRoot().catch(() => process.cwd());
  const detection = await detectXaiMcp({ root });
  if (flag(args, '--json')) return console.log(JSON.stringify(detection, null, 2));
  console.log('SKS xAI / Grok search MCP\n');
  console.log(`Status:    ${describeStatus(detection.status)}`);
  console.log(`Configured: ${detection.configured ? 'yes' : 'no'}`);
  console.log(`Search-capable: ${detection.search_capable ? 'yes' : detection.configured_but_unverified ? 'configured (tools unverified at runtime)' : 'no'}`);
  if (detection.servers.length) {
    for (const server of detection.servers) {
      console.log(`  • ${server.raw_name} (${server.source})${server.tools.length ? ` tools: ${server.tools.join(', ')}` : ''}`);
    }
  }
  console.log(`Checked:   ${detection.config_paths_checked.join(', ') || 'none'}`);
  if (!detection.configured) {
    console.log('\nNot configured. Run: sks xai setup --scope project --command "<your-xai-mcp-server>"');
    console.log('Then export your key:    export XAI_API_KEY=xai-...');
    console.log(`Docs: ${XAI_DOCS_URL}`);
  } else if (detection.status === 'configured_but_unverified') {
    console.log('\nServer is registered; tool capability is verified when Codex lists its tools at runtime.');
  }
}

async function xaiSetup(args: string[]) {
  const scope = readOption(args, '--scope', flag(args, '--global') ? 'global' : 'project');
  if (!['project', 'global'].includes(scope)) throw new Error('Invalid xAI scope. Use --scope project or --scope global.');
  const name = sanitizeServerName(readOption(args, '--name', DEFAULT_SERVER_NAME));
  const url = readOption(args, '--url', null);
  const command = readOption(args, '--command', null);
  const commandArgs = readRepeatedOption(args, '--arg');
  const envKey = readOption(args, '--api-key-env', 'XAI_API_KEY');

  if (!url && !command) {
    // Nothing to install yet: print a ready-to-paste config + the exact next steps
    // instead of writing a broken/guessed server entry.
    printSetupGuidance(scope, name, envKey);
    return;
  }

  if (scope === 'global') {
    const codex = await getCodexInfo();
    if (!codex.bin) throw new Error('Codex CLI missing. Install @openai/codex or set SKS_CODEX_BIN, then re-run.');
    const cmdArgs = url
      ? ['mcp', 'add', name, '--url', url]
      : ['mcp', 'add', name, '--', command as string, ...commandArgs];
    const result = await runProcess(codex.bin, cmdArgs, { timeoutMs: 30000, maxOutputBytes: 64 * 1024 });
    if (flag(args, '--json')) return console.log(JSON.stringify({ scope, name, command: `${codex.bin} ${cmdArgs.join(' ')}`, result }, null, 2));
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || 'codex mcp add failed');
    console.log(`xAI/Grok MCP "${name}" registered globally.`);
    console.log(`Set your key: export ${envKey}=xai-...   (docs: ${XAI_DOCS_URL})`);
    return;
  }

  const root = await projectRoot().catch(() => sksRoot());
  const changed = await ensureProjectXaiMcpConfig(root, { name, url, command, commandArgs, envKey });
  const detection = await detectXaiMcp({ root });
  if (flag(args, '--json')) return console.log(JSON.stringify({ scope, name, changed, detection }, null, 2));
  console.log(`xAI/Grok MCP "${name}" ${changed ? 'configured' : 'already configured'} in .codex/config.toml`);
  console.log(`Detected:  ${detection.configured ? 'yes' : 'no'} (${detection.status})`);
  console.log(`Set your key: export ${envKey}=xai-...   (docs: ${XAI_DOCS_URL})`);
}

async function xaiDocs(_args: string[]) {
  console.log('SKS xAI / Grok search integration\n');
  console.log(`API base:   ${XAI_API_BASE}`);
  console.log('Auth:       XAI_API_KEY (Bearer)');
  console.log('Model:      grok-4.x (OpenAI-compatible Responses API)');
  console.log('Tools:      web_search, x_search (agentic Live Search)');
  console.log(`Reference:  ${XAI_DOCS_URL}\n`);
  console.log('Wire it into SKS source-intelligence with an MCP server:');
  console.log('  sks xai setup --scope project --command "npx" --arg "-y" --arg "<your-grok-search-mcp>"');
  console.log('  sks xai setup --scope global  --url "https://<your-grok-mcp-endpoint>"');
  console.log('  export XAI_API_KEY=xai-...');
  console.log('  sks xai check');
}

function printSetupGuidance(scope: string, name: string, envKey: string) {
  console.log('SKS xAI / Grok search setup\n');
  console.log('Specify the MCP server to register. Examples:');
  console.log(`  sks xai setup --scope ${scope} --command "npx" --arg "-y" --arg "<your-grok-search-mcp>"`);
  console.log(`  sks xai setup --scope ${scope} --url "https://<your-grok-mcp-endpoint>"`);
  console.log('\nReady-to-paste .codex/config.toml block (edit command/args for your server):\n');
  console.log(xaiMcpToml({ name, command: 'npx', commandArgs: ['-y', '<your-grok-search-mcp>'], envKey }).trim());
  console.log(`\nThen set your key:  export ${envKey}=xai-...`);
  console.log(`Docs: ${XAI_DOCS_URL}`);
}

export function xaiMcpToml(opts: { name: string; url?: string | null; command?: string | null; commandArgs?: string[]; envKey?: string }): string {
  const name = sanitizeServerName(opts.name || DEFAULT_SERVER_NAME);
  const envKey = opts.envKey || 'XAI_API_KEY';
  const lines = [`[mcp_servers.${name}]`];
  if (opts.url) {
    lines.push(`url = ${JSON.stringify(opts.url)}`);
  } else {
    lines.push(`command = ${JSON.stringify(opts.command || 'npx')}`);
    const argv = (opts.commandArgs && opts.commandArgs.length) ? opts.commandArgs : ['-y', '<your-grok-search-mcp>'];
    lines.push(`args = [${argv.map((a) => JSON.stringify(a)).join(', ')}]`);
  }
  lines.push(`env = { ${envKey} = ${JSON.stringify(`\${${envKey}}`)} }`);
  lines.push('');
  return lines.join('\n');
}

async function ensureProjectXaiMcpConfig(root: string, opts: { name: string; url: string | null; command: string | null; commandArgs: string[]; envKey: string }): Promise<boolean> {
  const configPath = path.join(root, '.codex', 'config.toml');
  await ensureDir(path.dirname(configPath));
  const current = await readText(configPath, '');
  const block = xaiMcpToml(opts).trim();
  const existingRe = new RegExp(`(^|\\n)\\[mcp_servers\\.${escapeRegExp(opts.name)}\\]\\n[\\s\\S]*?(?=\\n\\[[^\\]]+\\]|\\s*$)`);
  if (existingRe.test(current)) {
    const next = current.replace(existingRe, `$1${block}\n`);
    if (next === current) return false;
    await writeTextAtomic(configPath, next.endsWith('\n') ? next : `${next}\n`);
    return true;
  }
  const text = String(current);
  await writeTextAtomic(configPath, `${text.trimEnd()}${text.trim() ? '\n\n' : ''}${block}\n`);
  return true;
}

function describeStatus(status: string): string {
  switch (status) {
    case 'search_capable': return 'search-capable (ready)';
    case 'configured_but_unverified': return 'configured (verify tools at runtime)';
    case 'configured_no_search': return 'configured but no search tool detected';
    case 'missing': return 'not configured';
    default: return status;
  }
}

function sanitizeServerName(value: unknown): string {
  const cleaned = String(value || DEFAULT_SERVER_NAME).trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || DEFAULT_SERVER_NAME;
}

function readOption(args: string[], name: string, fallback: any) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !String(args[i + 1]).startsWith('--') ? args[i + 1] : fallback;
}

function readRepeatedOption(args: string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === name && args[i + 1]) out.push(String(args[i + 1]));
  }
  return out;
}

function escapeRegExp(value: unknown): string {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
