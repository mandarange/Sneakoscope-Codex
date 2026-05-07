import { projectRoot, readJson, runProcess, sksRoot } from '../core/fsx.mjs';
import { getCodexInfo } from '../core/codex-adapter.mjs';
import { context7Docs, context7Resolve, context7Text, context7Tools } from '../core/context7-client.mjs';
import { context7Evidence, recordContext7Evidence } from '../core/pipeline.mjs';
import { stateFile } from '../core/mission.mjs';
import { checkContext7, ensureProjectContext7Config } from './install-helpers.mjs';

const flag = (args, name) => args.includes(name);

export async function context7Command(sub = 'check', args = []) {
  const action = sub || 'check';
  const setupScope = action === 'setup' ? readOption(args, '--scope', flag(args, '--global') ? 'global' : 'project') : null;
  const root = action === 'setup' && setupScope === 'project' ? await projectRoot() : await sksRoot();
  if (action === 'check') {
    const result = await checkContext7(root);
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log('SKS Context7 MCP\n');
    console.log(`Project config: ${result.project.ok ? 'ok' : 'missing'} ${result.project.path}`);
    console.log(`Global config:  ${result.global.ok ? 'ok' : 'missing'} ${result.global.path}`);
    console.log(`Codex mcp list: ${result.codex_mcp_list.ok ? 'ok' : result.codex_mcp_list.checked ? 'missing' : 'not checked'}`);
    console.log(`Ready:          ${result.ok ? 'yes' : 'no'}`);
    if (!result.ok) console.log('\nRun: sks context7 setup --scope project');
    return;
  }
  if (action === 'tools') {
    const result = await context7Tools({ timeoutMs: readNumberOption(args, '--timeout-ms', 30000) });
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log('SKS Context7 Local MCP Tools\n');
    console.log(`Server: ${result.server.info?.name || 'context7'} ${result.server.info?.version || ''}`.trim());
    console.log(`Command: ${result.server.command} ${result.server.args.join(' ')}`);
    console.log(`Tools:  ${result.tool_names.join(', ') || 'none'}`);
    if (!result.tool_names.includes('resolve-library-id') || !result.tool_names.some((name) => name === 'query-docs' || name === 'get-library-docs')) {
      process.exitCode = 1;
      console.log('\nContext7 local MCP is missing the required resolve/docs tools.');
    }
    return;
  }
  if (action === 'resolve') {
    const positional = positionalArgs(args);
    const libraryName = positional.join(' ').trim();
    if (!libraryName) throw new Error('Usage: sks context7 resolve <library-name> [--query "..."] [--json]');
    const result = await context7Resolve(libraryName, {
      query: readOption(args, '--query', libraryName),
      timeoutMs: readNumberOption(args, '--timeout-ms', 30000)
    });
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    console.log('SKS Context7 Resolve\n');
    console.log(`Library: ${libraryName}`);
    console.log(`ID:      ${result.library_id || 'not resolved'}`);
    console.log(`Server:  ${result.server.info?.name || 'context7'} ${result.server.info?.version || ''}`.trim());
    const text = context7Text(result.result).split(/\n/).slice(0, 24).join('\n').trim();
    if (text) console.log(`\n${text}`);
    if (!result.ok || !result.library_id) process.exitCode = 1;
    return;
  }
  if (action === 'docs') {
    const positional = positionalArgs(args);
    const libraryNameOrId = positional.join(' ').trim();
    if (!libraryNameOrId) throw new Error('Usage: sks context7 docs <library-name|/org/project> [--query "..."] [--topic "..."] [--tokens N] [--json]');
    const result = await context7Docs(libraryNameOrId, {
      query: readOption(args, '--query', readOption(args, '--topic', libraryNameOrId)),
      topic: readOption(args, '--topic', libraryNameOrId),
      tokens: readNumberOption(args, '--tokens', 2000),
      timeoutMs: readNumberOption(args, '--timeout-ms', 30000)
    });
    if (flag(args, '--json')) return console.log(JSON.stringify(result, null, 2));
    printContext7DocsResult(result, { title: 'SKS Context7 Docs' });
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (action === 'evidence') {
    const positional = positionalArgs(args);
    const missionArg = positional.shift();
    const libraryNameOrId = positional.join(' ').trim();
    if (!missionArg || !libraryNameOrId) throw new Error('Usage: sks context7 evidence <mission-id|latest> <library-name|/org/project> [--query "..."] [--topic "..."] [--tokens N] [--json]');
    const missionId = await resolveMissionId(root, missionArg);
    if (!missionId) throw new Error('No mission found for Context7 evidence.');
    const result = await context7Docs(libraryNameOrId, {
      query: readOption(args, '--query', readOption(args, '--topic', libraryNameOrId)),
      topic: readOption(args, '--topic', libraryNameOrId),
      tokens: readNumberOption(args, '--tokens', 2000),
      timeoutMs: readNumberOption(args, '--timeout-ms', 30000)
    });
    const state = { ...(await readJson(stateFile(root), {})), mission_id: missionId };
    await recordContext7Evidence(root, state, { tool_name: 'resolve-library-id', library: libraryNameOrId, library_id: result.library_id, source: result.resolve ? 'sks context7 evidence' : 'sks context7 evidence explicit-library-id' });
    if (result.docs_tool) {
      await recordContext7Evidence(root, state, { tool_name: result.docs_tool, library_id: result.library_id, source: 'sks context7 evidence' });
    }
    const evidence = await context7Evidence(root, state);
    const out = { ...result, mission_id: missionId, evidence };
    if (flag(args, '--json')) return console.log(JSON.stringify(out, null, 2));
    printContext7DocsResult(result, { title: 'SKS Context7 Evidence' });
    console.log(`\nMission:  ${missionId}`);
    console.log(`Evidence: ${evidence.ok ? 'ok' : 'missing'} resolve=${evidence.resolve ? 'yes' : 'no'} docs=${evidence.docs ? 'yes' : 'no'} events=${evidence.count}`);
    if (!result.ok || !evidence.ok) process.exitCode = 1;
    return;
  }
  if (action === 'setup') {
    const scope = setupScope;
    const transport = readOption(args, '--transport', flag(args, '--remote') ? 'remote' : 'local');
    if (!['project', 'global'].includes(scope)) throw new Error('Invalid Context7 scope. Use project or global.');
    if (!['local', 'remote'].includes(transport)) throw new Error('Invalid Context7 transport. Use local or remote.');
    if (scope === 'project') {
      const changed = await ensureProjectContext7Config(root, transport);
      const result = await checkContext7(root);
      if (flag(args, '--json')) return console.log(JSON.stringify({ changed, ...result }, null, 2));
      console.log(`Context7 project MCP ${changed ? 'configured' : 'already configured'} in .codex/config.toml`);
      console.log(`Ready: ${result.ok ? 'yes' : 'no'}`);
      return;
    }
    const codex = await getCodexInfo();
    if (!codex.bin) throw new Error('Codex CLI missing. Install separately: npm i -g @openai/codex, or set SKS_CODEX_BIN.');
    const cmdArgs = transport === 'remote'
      ? ['mcp', 'add', 'context7', '--url', 'https://mcp.context7.com/mcp']
      : ['mcp', 'add', 'context7', '--', 'npx', '-y', '@upstash/context7-mcp@latest'];
    const result = await runProcess(codex.bin, cmdArgs, { timeoutMs: 30000, maxOutputBytes: 64 * 1024 });
    if (flag(args, '--json')) return console.log(JSON.stringify({ command: `${codex.bin} ${cmdArgs.join(' ')}`, result }, null, 2));
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || 'codex mcp add failed');
    console.log('Context7 global MCP configured.');
    return;
  }
  throw new Error(`Unknown context7 command: ${action}`);
}

function printContext7DocsResult(result, opts = {}) {
  console.log(`${opts.title || 'SKS Context7 Docs'}\n`);
  console.log(`Library ID: ${result.library_id || 'not resolved'}`);
  console.log(`Docs tool:  ${result.docs_tool || 'missing'}`);
  console.log(`Server:     ${result.server?.info?.name || 'context7'} ${result.server?.info?.version || ''}`.trim());
  const text = context7Text(result.docs).split(/\n/).slice(0, 48).join('\n').trim();
  if (text) console.log(`\n${text}`);
  if (result.error) console.log(`\nError: ${result.error}`);
}

function readOption(args, name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

function readNumberOption(args, name, fallback) {
  const raw = readOption(args, name, null);
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function positionalArgs(args = []) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (String(arg).startsWith('--')) {
      if (args[i + 1] && !String(args[i + 1]).startsWith('--')) i++;
      continue;
    }
    out.push(arg);
  }
  return out;
}

async function resolveMissionId(root, arg) {
  const { findLatestMission } = await import('../core/mission.mjs');
  return (!arg || arg === 'latest') ? findLatestMission(root) : arg;
}
