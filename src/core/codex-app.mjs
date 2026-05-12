import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { exists, runProcess } from './fsx.mjs';
import { getCodexInfo } from './codex-adapter.mjs';

export const CODEX_APP_DOCS_URL = 'https://developers.openai.com/codex/app/features';
export const CODEX_CHANGELOG_URL = 'https://developers.openai.com/codex/changelog';
export const CODEX_REMOTE_CONTROL_MIN_VERSION = '0.130.0';
const REQUIRED_CODEX_APP_FEATURE_FLAGS = ['codex_git_commit', 'hooks', 'fast_mode', 'computer_use', 'apps', 'plugins'];

export function codexAppCandidatePaths(home = os.homedir(), env = process.env) {
  const candidates = [];
  if (env.SKS_CODEX_APP_PATH) candidates.push(env.SKS_CODEX_APP_PATH);
  if (process.platform === 'darwin') {
    candidates.push('/Applications/Codex.app');
    candidates.push(path.join(home || '', 'Applications', 'Codex.app'));
  }
  if (process.platform === 'win32') {
    const local = env.LOCALAPPDATA || path.join(home || '', 'AppData', 'Local');
    candidates.push(path.join(local, 'Programs', 'Codex', 'Codex.exe'));
    candidates.push(path.join(local, 'Codex', 'Codex.exe'));
  }
  return Array.from(new Set(candidates.filter(Boolean)));
}

export async function findCodexApp(opts = {}) {
  for (const candidate of codexAppCandidatePaths(opts.home || os.homedir(), opts.env || process.env)) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

async function findPluginCache(pluginName, opts = {}) {
  const home = opts.home || os.homedir();
  const roots = [
    path.join(home || '', '.codex', 'plugins', 'cache'),
    path.join(home || '', '.agents', 'plugins', 'cache')
  ];
  const needle = String(pluginName || '').toLowerCase();
  const maxEntries = Number(opts.maxEntries || 3000);
  let seen = 0;

  async function walk(dir, depth = 0) {
    if (!dir || seen > maxEntries || depth > 6 || !(await exists(dir))) return null;
    let entries = [];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return null; }
    for (const entry of entries) {
      if (seen++ > maxEntries) return null;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.toLowerCase() === needle) return full;
        const hit = await walk(full, depth + 1);
        if (hit) return hit;
      }
    }
    return null;
  }

  for (const root of roots) {
    const hit = await walk(root);
    if (hit) return hit;
  }
  return null;
}

export async function codexMcpList(opts = {}) {
  const codex = opts.codex || await getCodexInfo().catch(() => ({}));
  if (!codex.bin) return { ok: false, checked: false, stdout: '', stderr: 'Codex CLI missing.' };
  const out = await runProcess(codex.bin, ['mcp', 'list'], {
    timeoutMs: opts.timeoutMs || 10000,
    maxOutputBytes: 64 * 1024
  }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
  return {
    ok: out.code === 0,
    checked: true,
    stdout: out.stdout || '',
    stderr: out.stderr || ''
  };
}

export async function codexFeatureList(opts = {}) {
  const codex = opts.codex || await getCodexInfo().catch(() => ({}));
  if (!codex.bin) return { ok: false, checked: false, stdout: '', stderr: 'Codex CLI missing.' };
  const out = await runProcess(codex.bin, ['features', 'list'], {
    timeoutMs: opts.timeoutMs || 10000,
    maxOutputBytes: 64 * 1024
  }).catch((err) => ({ code: 1, stdout: '', stderr: err.message }));
  return {
    ok: out.code === 0,
    checked: true,
    stdout: out.stdout || '',
    stderr: out.stderr || ''
  };
}

export async function codexAppIntegrationStatus(opts = {}) {
  const appPath = await findCodexApp(opts);
  const codex = opts.codex || await getCodexInfo().catch(() => ({}));
  const mcpList = await codexMcpList({ ...opts, codex });
  const featureList = await codexFeatureList({ ...opts, codex });
  const remoteControl = codexRemoteControlStatusFromInfo(codex);
  const mcpText = `${mcpList.stdout}\n${mcpList.stderr}`;
  const featureText = `${featureList.stdout}\n${featureList.stderr}`;
  const browserUsePath = await findPluginCache('browser-use', opts);
  const computerUsePath = await findPluginCache('computer-use', opts);
  const computerUseMcpListed = /computer[-_ ]?use/i.test(mcpText);
  const browserUseMcpListed = /browser[-_ ]?use/i.test(mcpText);
  const imageGenerationReady = codexFeatureEnabled(featureText, 'image_generation');
  const requiredFeatureFlags = Object.fromEntries(REQUIRED_CODEX_APP_FEATURE_FLAGS.map((name) => [name, codexFeatureEnabled(featureText, name)]));
  const requiredFeatureFlagsOk = Object.values(requiredFeatureFlags).every(Boolean);
  const computerUseReady = computerUseMcpListed || Boolean(computerUsePath);
  const browserUseReady = browserUseMcpListed || Boolean(browserUsePath);
  const appInstalled = Boolean(appPath);
  const ready = appInstalled && Boolean(codex.bin) && mcpList.ok && featureList.ok && requiredFeatureFlagsOk && imageGenerationReady && computerUseReady && browserUseReady;
  return {
    ok: ready,
    app: {
      installed: appInstalled,
      path: appPath,
      docs_url: CODEX_APP_DOCS_URL
    },
    codex_cli: {
      ok: Boolean(codex.bin),
      bin: codex.bin || null,
      version: codex.version || null
    },
    remote_control: remoteControl,
    mcp: {
      checked: mcpList.checked,
      ok: mcpList.ok,
      has_computer_use: computerUseReady,
      has_browser_use: browserUseReady,
      computer_use_source: computerUseMcpListed ? 'mcp_list' : computerUsePath ? 'plugin_cache' : 'missing',
      browser_use_source: browserUseMcpListed ? 'mcp_list' : browserUsePath ? 'plugin_cache' : 'missing',
      stdout: mcpList.stdout,
      stderr: mcpList.stderr
    },
    features: {
      checked: featureList.checked,
      ok: featureList.ok,
      ...requiredFeatureFlags,
      required_flags: requiredFeatureFlags,
      required_flags_ok: requiredFeatureFlagsOk,
      image_generation: imageGenerationReady,
      image_generation_source: imageGenerationReady ? 'codex_features_list' : 'missing',
      stdout: featureList.stdout,
      stderr: featureList.stderr
    },
    plugins: {
      computer_use_cache: computerUsePath,
      browser_use_cache: browserUsePath
    },
    guidance: codexAppGuidance({ appInstalled, codex, mcpList, featureList, requiredFeatureFlags, requiredFeatureFlagsOk, imageGenerationReady, computerUseReady, browserUseReady, computerUseMcpListed, browserUseMcpListed, remoteControl })
  };
}

export async function codexRemoteControlStatus(opts = {}) {
  const codex = opts.codex || await getCodexInfo().catch(() => ({}));
  return codexRemoteControlStatusFromInfo(codex);
}

export function codexRemoteControlStatusFromInfo(codex = {}) {
  const current = codexCliVersionNumber(codex.version);
  const versionKnown = Boolean(current);
  const supported = Boolean(codex.bin && current && compareVersions(current, CODEX_REMOTE_CONTROL_MIN_VERSION) >= 0);
  return {
    ok: supported,
    min_version: CODEX_REMOTE_CONTROL_MIN_VERSION,
    docs_url: CODEX_CHANGELOG_URL,
    codex_cli: {
      ok: Boolean(codex.bin),
      bin: codex.bin || null,
      version: codex.version || null,
      version_number: current
    },
    command: codex.bin ? `${codex.bin} remote-control` : 'codex remote-control',
    reason: supported
      ? 'available'
      : !codex.bin
        ? 'codex_cli_missing'
        : versionKnown
          ? `requires_codex_cli_${CODEX_REMOTE_CONTROL_MIN_VERSION}_or_newer`
          : 'codex_cli_version_unknown'
  };
}

export function codexSupportsRemoteControl(versionText) {
  const current = codexCliVersionNumber(versionText);
  return Boolean(current && compareVersions(current, CODEX_REMOTE_CONTROL_MIN_VERSION) >= 0);
}

export function formatCodexRemoteControlStatus(status) {
  const lines = [
    'Codex remote-control',
    '',
    `Codex CLI: ${status.codex_cli.ok ? 'ok' : 'missing'}${status.codex_cli.version ? ` ${status.codex_cli.version}` : ''}`,
    `Minimum:   ${status.min_version}`,
    `Ready:     ${status.ok ? 'yes' : 'no'}`,
    `Command:   ${status.command}`,
    '',
    status.ok
      ? 'Run: sks codex-app remote-control -- <codex remote-control args>'
      : remoteControlGuidance(status)
  ];
  return lines.filter(Boolean).join('\n');
}

export function codexAppGuidance({ appInstalled, codex, mcpList, featureList, requiredFeatureFlags = {}, requiredFeatureFlagsOk = true, imageGenerationReady, computerUseReady, browserUseReady, computerUseMcpListed, browserUseMcpListed, remoteControl }) {
  const lines = [];
  if (!appInstalled) {
    lines.push('Install and open Codex App for first-party MCP/plugin tools. SKS tmux launch can still run with Codex CLI alone, but Codex Computer Use and imagegen/gpt-image-2 evidence will be unavailable until Codex App is ready.');
    lines.push(`Docs: ${CODEX_APP_DOCS_URL}`);
  }
  if (!codex?.bin) lines.push('Install Codex CLI too: npm i -g @openai/codex, or set SKS_CODEX_BIN.');
  if (remoteControl?.ok) {
    lines.push('Codex remote-control is available for headless remotely controllable app-server sessions: sks codex-app remote-control.');
    lines.push('Codex CLI 0.130.0+ app-server threads can pick up config changes without restarting the app-server; restart older CLI/TUI sessions if they were launched before config changes.');
  } else if (codex?.bin) {
    lines.push(remoteControlGuidance(remoteControl || codexRemoteControlStatusFromInfo(codex)));
  }
  if (mcpList?.checked && !mcpList.ok) {
    lines.push(`Codex MCP/config check failed: ${summarizeCodexMcpError(mcpList.stderr || mcpList.stdout)}`);
    lines.push('Verify with: codex mcp list');
  }
  if (featureList?.checked && !featureList.ok) {
    lines.push(`Codex feature check failed: ${summarizeCodexMcpError(featureList.stderr || featureList.stdout)}`);
    lines.push('Verify with: codex features list');
  }
  if (featureList?.checked && featureList.ok && !requiredFeatureFlagsOk) {
    const missing = missingRequiredFeatureFlags(requiredFeatureFlags);
    lines.push(`Codex App feature flag(s) disabled or missing: ${missing.join(', ')}. Commit message generation and app-only tool paths can fail even when CLI chat works.`);
    lines.push('Verify with: codex features list | rg "codex_git_commit|hooks|fast_mode|computer_use|apps|plugins"');
  }
  if (appInstalled && (!computerUseReady || !browserUseReady)) {
    lines.push('Open Codex App settings and enable recommended MCP/plugin tools. Codex CLI 0.130.0+ remote-control/app-server sessions can pick up config changes live; restart older CLI/TUI sessions.');
    lines.push('Required for SKS QA-LOOP UI/browser evidence: Codex Computer Use only. Browser Use can support non-UI browser context, but it does not satisfy UI-level E2E verification.');
    lines.push('Verify with: codex mcp list');
  }
  if (imageGenerationReady) {
    lines.push('Image generation is enabled; required raster assets and generated image-review evidence must invoke $imagegen/gpt-image-2 and record real output.');
  } else if (appInstalled || codex?.bin) {
    lines.push('Codex image_generation was not visible from `codex features list`. Required imagegen/gpt-image-2 evidence must stay blocked or unverified until $imagegen is available in Codex App.');
  }
  if (computerUseReady && !computerUseMcpListed) {
    lines.push('Computer Use plugin files are installed, but this check cannot prove the current thread exposes the live Computer Use tools. Start a new Codex App thread and invoke @Computer or @AppName for the actual target app or screen; Codex App readiness itself should stay on `codex features list`, `codex mcp list`, and `sks codex-app check`.');
  }
  if (browserUseReady && !browserUseMcpListed) {
    lines.push('Browser Use plugin files are installed, but `codex mcp list` does not list a browser-use MCP server. Treat Browser Use as plugin-scoped, not as SKS UI verification evidence.');
  }
  if (!lines.length) lines.push('Codex App, Codex CLI, Computer Use, Browser Use, and image generation checks look ready. UI-level E2E still requires Codex Computer Use evidence; generated image evidence still requires $imagegen/gpt-image-2 output.');
  return lines;
}

export function formatCodexAppStatus(status, { includeRaw = false } = {}) {
  const lines = [
    'Codex App / MCP Plugin Readiness',
    '',
    `Codex App:   ${status.app.installed ? 'ok' : 'missing'}${status.app.path ? ` ${status.app.path}` : ''}`,
    `Codex CLI:   ${status.codex_cli.ok ? 'ok' : 'missing'}${status.codex_cli.version ? ` ${status.codex_cli.version}` : ''}`,
    `Remote Ctrl: ${status.remote_control?.ok ? 'ok' : 'missing'}${status.remote_control?.codex_cli?.version_number ? ` min ${status.remote_control.min_version}` : ''}`,
    `App Flags:  ${status.features?.required_flags_ok ? 'ok' : `missing ${missingRequiredFeatureFlags(status.features?.required_flags).join(', ') || 'required flags'}`}`,
    `Computer Use:${status.mcp.has_computer_use ? status.mcp.computer_use_source === 'plugin_cache' ? ' installed (verify @Computer in thread)' : ' ok' : ' missing'}`,
    `Browser Use: ${status.mcp.has_browser_use ? status.mcp.browser_use_source === 'plugin_cache' ? 'installed (plugin scoped)' : 'ok' : 'missing'}`,
    `Image Gen:   ${status.features?.image_generation ? 'ok ($imagegen/gpt-image-2)' : status.features?.checked ? 'missing' : 'not checked'}`,
    `Ready:       ${status.ok ? 'yes' : 'no'}`,
    '',
    ...status.guidance.map((line) => `- ${line}`)
  ];
  if (includeRaw && status.mcp.stdout) lines.push('', status.mcp.stdout.trim());
  if (includeRaw && status.features?.stdout) lines.push('', status.features.stdout.trim());
  return lines.join('\n');
}

function summarizeCodexMcpError(text) {
  const cleanLines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('WARNING: proceeding'));
  const variantLine = cleanLines.find((line) => line.includes('unknown variant'));
  const errorLine = cleanLines.find((line) => line.startsWith('Error:'));
  if (errorLine && variantLine && errorLine !== variantLine) return `${errorLine}; ${variantLine}`;
  return variantLine || errorLine || cleanLines[0] || 'codex mcp list failed';
}

function codexFeatureEnabled(text, featureName) {
  const expected = String(featureName || '').toLowerCase();
  return String(text || '').split(/\r?\n/).some((line) => {
    const parts = line.trim().split(/\s+/).filter(Boolean);
    return parts[0]?.toLowerCase() === expected && parts[parts.length - 1]?.toLowerCase() === 'true';
  });
}

function missingRequiredFeatureFlags(flags = {}) {
  return REQUIRED_CODEX_APP_FEATURE_FLAGS.filter((name) => flags?.[name] !== true);
}

function remoteControlGuidance(status = {}) {
  if (!status.codex_cli?.ok) return 'Codex remote-control requires Codex CLI 0.130.0+. Install with: npm i -g @openai/codex@latest';
  if (status.reason === 'codex_cli_version_unknown') return 'Codex remote-control requires Codex CLI 0.130.0+, but the installed CLI version could not be parsed. Check: codex --version';
  return `Codex remote-control requires Codex CLI ${CODEX_REMOTE_CONTROL_MIN_VERSION}+. Update with: npm i -g @openai/codex@latest`;
}

function codexCliVersionNumber(versionText = '') {
  const match = String(versionText || '').match(/(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)/);
  return match ? match[1] : null;
}

function compareVersions(a, b) {
  const pa = String(a || '').split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = String(b || '').split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length, 3); i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}
