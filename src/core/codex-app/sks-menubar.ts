import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ensureDir, exists, runProcess, which, writeJsonAtomic, writeTextAtomic } from '../fsx.js';

export interface SksMenuBarInstallResult {
  schema: 'sks.codex-app-sks-menubar.v1';
  ok: boolean;
  apply: boolean;
  status: 'planned' | 'installed' | 'installed_launch_skipped' | 'installed_open_fallback' | 'unsupported_platform' | 'blocked';
  platform: NodeJS.Platform;
  app_path: string | null;
  executable_path: string | null;
  launch_agent_path: string | null;
  action_script_path: string | null;
  report_path: string | null;
  menu_items: string[];
  actions: string[];
  launch?: {
    requested: boolean;
    method: 'launchctl' | 'open-fallback' | 'skipped' | 'none';
    ok: boolean;
    bootstrap_code?: number | null;
    kickstart_code?: number | null;
    print_code?: number | null;
    open_code?: number | null;
    error?: string | null;
  };
  blockers: string[];
  warnings: string[];
}

export interface SksMenuBarInstallOptions {
  apply?: boolean;
  launch?: boolean;
  root?: string;
  home?: string;
  sksEntry?: string;
  env?: NodeJS.ProcessEnv;
}

const LABEL = 'com.sneakoscope.sks-menubar';
const CONTROL_CENTER_DOMAIN = 'com.apple.controlcenter';
const CONTROL_CENTER_PREFERRED_POSITION = 360;
const MENU_ITEMS = [
  'Use codex-lb',
  'Use ChatGPT OAuth',
  'Set OpenRouter Key and GLM Profiles',
  'Fast Check',
  'SKS Version Check',
  'Update SKS Now',
  'Open Codex Settings',
  'Restart Codex',
  'Quit SKS Menu'
];

export async function installSksMenuBar(opts: SksMenuBarInstallOptions = {}): Promise<SksMenuBarInstallResult> {
  const apply = opts.apply === true;
  const env = opts.env || process.env;
  const home = path.resolve(opts.home || env.HOME || os.homedir());
  const root = path.resolve(opts.root || process.cwd());
  const installDir = path.join(home, '.codex', 'sks-menubar');
  const appPath = path.join(installDir, 'SKSMenuBar.app');
  const contentsPath = path.join(appPath, 'Contents');
  const macosPath = path.join(contentsPath, 'MacOS');
  const executablePath = path.join(macosPath, 'SKSMenuBar');
  const sourcePath = path.join(installDir, 'SKSMenuBar.swift');
  const infoPlistPath = path.join(contentsPath, 'Info.plist');
  const actionScriptPath = path.join(installDir, 'sks-menubar-action.sh');
  const launchAgentPath = path.join(home, 'Library', 'LaunchAgents', `${LABEL}.plist`);
  const reportPath = path.join(root, '.sneakoscope', 'reports', 'sks-menubar.json');
  const actions: string[] = [];
  const warnings: string[] = [];

  if (process.platform !== 'darwin') {
    const result: SksMenuBarInstallResult = {
      schema: 'sks.codex-app-sks-menubar.v1',
      ok: true,
      apply,
      status: 'unsupported_platform',
      platform: process.platform,
      app_path: null,
      executable_path: null,
      launch_agent_path: null,
      action_script_path: null,
      report_path: apply ? reportPath : null,
      menu_items: MENU_ITEMS,
      actions: [],
      launch: { requested: false, method: 'none', ok: true },
      blockers: [],
      warnings: ['sks_menubar_requires_macos']
    };
    if (apply) await writeJsonAtomic(reportPath, result).catch(() => undefined);
    return result;
  }

  if (!apply) {
    const installed = await exists(executablePath);
    const launchAgent = await exists(launchAgentPath);
    return {
      schema: 'sks.codex-app-sks-menubar.v1',
      ok: true,
      apply,
      status: 'planned',
      platform: process.platform,
      app_path: appPath,
      executable_path: executablePath,
      launch_agent_path: launchAgentPath,
      action_script_path: actionScriptPath,
      report_path: reportPath,
      menu_items: MENU_ITEMS,
      actions: installed ? ['menubar_app_present'] : ['menubar_app_install_available'],
      launch: {
        requested: false,
        method: 'skipped',
        ok: true
      },
      blockers: [],
      warnings: launchAgent ? [] : ['launch_agent_not_installed_yet']
    };
  }

  const swiftc = env.SKS_MENUBAR_SWIFTC || await which('swiftc').catch(() => null) || await fallbackTool('/usr/bin/swiftc');
  const launchctl = env.SKS_MENUBAR_LAUNCHCTL || await which('launchctl').catch(() => null) || await fallbackTool('/bin/launchctl');
  const open = env.SKS_MENUBAR_OPEN || await which('open').catch(() => null) || await fallbackTool('/usr/bin/open');
  if (!swiftc) return await blockedResult('swiftc_missing');

  await ensureDir(installDir);
  await ensureDir(macosPath);
  await ensureDir(path.dirname(launchAgentPath));

  const sksEntry = resolveSksEntry(opts.sksEntry);
  await writeTextAtomic(actionScriptPath, actionScriptSource({ nodeBin: process.execPath, sksEntry }));
  await fs.chmod(actionScriptPath, 0o755);
  actions.push(`wrote ${actionScriptPath}`);

  await writeTextAtomic(sourcePath, swiftMenuSource(actionScriptPath));
  actions.push(`wrote ${sourcePath}`);

  await writeTextAtomic(infoPlistPath, infoPlistSource());
  actions.push(`wrote ${infoPlistPath}`);

  const compile = await runProcess(swiftc, ['-framework', 'Cocoa', sourcePath, '-o', executablePath], {
    timeoutMs: 60_000,
    maxOutputBytes: 64 * 1024
  }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
  if (compile.code !== 0) {
    return await blockedResult('swift_compile_failed', String(compile.stderr || compile.stdout || '').trim());
  }
  await fs.chmod(executablePath, 0o755).catch(() => undefined);
  actions.push(`compiled ${executablePath}`);

  await writeTextAtomic(launchAgentPath, launchAgentSource(executablePath, installDir));
  actions.push(`wrote ${launchAgentPath}`);

  const launchWanted = opts.launch !== false && env.SKS_SKIP_SKS_MENUBAR_LAUNCH !== '1';
  const launchAllowedForHome = path.resolve(home) === realUserHome();
  const installUnderTempDir = isMenuBarInstallPathUnderTempDir(executablePath, env);
  if (launchWanted && !launchAllowedForHome) warnings.push('launch_skipped_non_user_home');
  if (launchWanted && installUnderTempDir) warnings.push('launch_skipped_temp_install');
  const launchRequested = launchWanted && launchAllowedForHome && !installUnderTempDir;
  if (launchRequested) {
    const preferredPosition = await seedMenuBarPreferredPosition(env);
    if (preferredPosition.ok) actions.push('seeded SKS menu bar preferred position');
    else warnings.push(preferredPosition.warning);
  }
  const launch = launchRequested && launchctl
    ? await launchWithLaunchctl({ launchctl, open, appPath, executablePath, launchAgentPath })
    : {
        requested: launchRequested,
        method: 'skipped' as const,
        ok: !launchRequested,
        error: launchRequested ? 'launchctl_missing' : null
      };
  if (launchRequested && !launchctl) warnings.push('launchctl_missing');
  if (launch.method === 'open-fallback') warnings.push('launchctl_bootstrap_failed_open_fallback_used');

  const ok = launch.ok === true;
  const result: SksMenuBarInstallResult = {
    schema: 'sks.codex-app-sks-menubar.v1',
    ok,
    apply,
    status: ok
      ? launch.requested === false || launch.method === 'skipped'
        ? 'installed_launch_skipped'
        : launch.method === 'open-fallback'
          ? 'installed_open_fallback'
          : 'installed'
      : 'blocked',
    platform: process.platform,
    app_path: appPath,
    executable_path: executablePath,
    launch_agent_path: launchAgentPath,
    action_script_path: actionScriptPath,
    report_path: reportPath,
    menu_items: MENU_ITEMS,
    actions,
    launch,
    blockers: ok ? [] : [launch.error || 'sks_menubar_launch_failed'],
    warnings
  };
  await writeJsonAtomic(reportPath, result).catch(() => undefined);
  return result;

  async function blockedResult(reason: string, detail?: string): Promise<SksMenuBarInstallResult> {
    const result: SksMenuBarInstallResult = {
      schema: 'sks.codex-app-sks-menubar.v1',
      ok: false,
      apply,
      status: 'blocked',
      platform: process.platform,
      app_path: appPath,
      executable_path: executablePath,
      launch_agent_path: launchAgentPath,
      action_script_path: actionScriptPath,
      report_path: reportPath,
      menu_items: MENU_ITEMS,
      actions,
      launch: { requested: false, method: 'none', ok: false, error: detail || reason },
      blockers: [reason],
      warnings: detail ? [detail] : []
    };
    await writeJsonAtomic(reportPath, result).catch(() => undefined);
    return result;
  }
}

async function fallbackTool(candidate: string): Promise<string | null> {
  return await exists(candidate).then((ok) => ok ? candidate : null).catch(() => null);
}

async function seedMenuBarPreferredPosition(env: NodeJS.ProcessEnv): Promise<{ ok: true } | { ok: false; warning: string }> {
  const defaults = env.SKS_MENUBAR_DEFAULTS || await which('defaults').catch(() => null) || await fallbackTool('/usr/bin/defaults');
  if (!defaults) return { ok: false, warning: 'defaults_missing_for_menubar_position_seed' };

  // macOS stores status-item ordering hints in Control Center prefs keyed by
  // autosaveName. Seeding this keeps SKS right of the notch-overflow zone.
  const writes = [
    ['write', CONTROL_CENTER_DOMAIN, `NSStatusItem Preferred Position ${LABEL}`, '-int', String(CONTROL_CENTER_PREFERRED_POSITION)],
    ['write', CONTROL_CENTER_DOMAIN, `NSStatusItem Visible ${LABEL}`, '-bool', 'true'],
    ['write', CONTROL_CENTER_DOMAIN, `NSStatusItem VisibleCC ${LABEL}`, '-bool', 'true']
  ];
  for (const args of writes) {
    const result = await runProcess(defaults, args, {
      timeoutMs: 10_000,
      maxOutputBytes: 16 * 1024
    }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
    if (result.code !== 0) return { ok: false, warning: 'menubar_position_seed_failed' };
  }
  return { ok: true };
}

/**
 * Refuse to auto-launch a menu bar app whose executable lives under a temp dir.
 * Release gates run in hermetic envs rooted at os.tmpdir()/SKS_TMP_DIR; without
 * this guard a gate could spawn a real GUI status item that leaks into the
 * user's live menu bar (duplicate `com.sneakoscope.sks-menubar` process). This
 * is defense-in-depth behind SKS_SKIP_SKS_MENUBAR_LAUNCH and the home check.
 */
export function isMenuBarInstallPathUnderTempDir(target: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const resolved = path.resolve(target);
  const roots = new Set<string>();
  const addRoot = (value: string | undefined | null): void => {
    if (!value) return;
    const abs = path.resolve(value);
    roots.add(abs);
    // macOS resolves TMPDIR / os.tmpdir() (/var/folders/...) through a /private symlink.
    if (abs.startsWith('/var/')) roots.add(path.resolve('/private', abs.slice(1)));
    else if (abs.startsWith('/private/var/')) roots.add(abs.replace('/private', ''));
  };
  addRoot(os.tmpdir());
  addRoot(env.TMPDIR);
  addRoot(env.SKS_TMP_DIR);
  for (const root of roots) {
    if (resolved === root) return true;
    const prefix = root.endsWith(path.sep) ? root : root + path.sep;
    if (resolved.startsWith(prefix)) return true;
  }
  return false;
}

function realUserHome(): string {
  try {
    const userHome = os.userInfo().homedir;
    if (userHome) return path.resolve(userHome);
  } catch {
    // Fall back below for platforms where userInfo is unavailable.
  }
  return path.resolve(os.homedir());
}

function resolveSksEntry(explicit?: string): string {
  if (explicit) return path.resolve(explicit);
  const argvEntry = process.argv[1] ? path.resolve(process.argv[1]) : '';
  return argvEntry || path.join(process.cwd(), 'dist', 'bin', 'sks.js');
}

function actionScriptSource(input: { nodeBin: string; sksEntry: string }) {
  return `#!/bin/zsh
set -e
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
NODE_BIN=${shellQuote(input.nodeBin)}
SKS_ENTRY=${shellQuote(input.sksEntry)}
if [ -x "$NODE_BIN" ] && [ -f "$SKS_ENTRY" ]; then
  exec "$NODE_BIN" "$SKS_ENTRY" "$@"
fi
if command -v sks >/dev/null 2>&1; then
  exec sks "$@"
fi
echo "SKS command not found. Run npm link or install Sneakoscope Codex, then run sks doctor --fix again." >&2
exit 127
`;
}

function swiftMenuSource(actionScriptPath: string) {
  return `import Cocoa
import Foundation

let actionScript = ${swiftString(actionScriptPath)}

func shellQuote(_ value: String) -> String {
    return "'" + value.replacingOccurrences(of: "'", with: "'\\\\''") + "'"
}

func runDetached(_ executable: String, _ args: [String] = []) {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: executable)
    process.arguments = args
    try? process.run()
}

func runInTerminal(_ command: String) {
    let escaped = command
        .replacingOccurrences(of: "\\\\", with: "\\\\\\\\")
        .replacingOccurrences(of: "\\\"", with: "\\\\\\\"")
    let script = "tell application \\"Terminal\\" to activate\\n" +
        "tell application \\"Terminal\\" to do script \\"\(escaped)\\""
    runDetached("/usr/bin/osascript", ["-e", script])
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.autosaveName = "com.sneakoscope.sks-menubar"
        statusItem.isVisible = true
        if let button = statusItem.button {
            configureStatusButton(button)
        }

        let menu = NSMenu()
        add(menu, "Use codex-lb", #selector(useCodexLb))
        add(menu, "Use ChatGPT OAuth", #selector(useChatGptOAuth))
        menu.addItem(NSMenuItem.separator())
        add(menu, "Set OpenRouter Key and GLM Profiles", #selector(setOpenRouterKey))
        add(menu, "Fast Check", #selector(fastCheck))
        add(menu, "SKS Version Check", #selector(sksVersionCheck))
        add(menu, "Update SKS Now", #selector(updateSksNow))
        menu.addItem(NSMenuItem.separator())
        add(menu, "Open Codex Settings", #selector(openCodexSettings))
        add(menu, "Restart Codex", #selector(restartCodex))
        menu.addItem(NSMenuItem.separator())
        add(menu, "Quit SKS Menu", #selector(quit))
        statusItem.menu = menu
    }

    func configureStatusButton(_ button: NSStatusBarButton) {
        button.image = nil
        button.title = "SKS"
        button.font = NSFont.systemFont(ofSize: NSFont.systemFontSize, weight: .semibold)
        button.toolTip = "SKS - Sneakoscope Codex settings"
        button.setAccessibilityLabel("SKS")
        button.setAccessibilityHelp("Open SKS menu")
    }

    func add(_ menu: NSMenu, _ title: String, _ selector: Selector) {
        let item = NSMenuItem(title: title, action: selector, keyEquivalent: "")
        item.target = self
        menu.addItem(item)
    }

    func runSks(_ args: [String], tail: String = "echo; echo 'SKS command finished. Close this window when ready.'") {
        let quoted = args.map(shellQuote).joined(separator: " ")
        runInTerminal("\\(shellQuote(actionScript)) \\(quoted); \\(tail)")
    }

    @objc func useCodexLb() {
        runSks(["codex-lb", "use-codex-lb"])
    }

    @objc func useChatGptOAuth() {
        runSks(["codex-lb", "use-oauth"])
    }

    @objc func setOpenRouterKey() {
        let command = "printf 'Paste OpenRouter key, then press Return: '; read -r key; printf '%s\\\\n' \\"$key\\" | \\(shellQuote(actionScript)) codex-app set-openrouter-key --api-key-stdin; \\(shellQuote(actionScript)) codex-app glm-profile install; echo; echo 'OpenRouter/GLM update finished. Restart Codex if the model picker was already open.'"
        runInTerminal(command)
    }

    @objc func fastCheck() {
        runSks(["codex-lb", "fast-check"])
    }

    @objc func sksVersionCheck() {
        let sks = shellQuote(actionScript)
        runInTerminal("echo 'SKS version'; \\(sks) --version; echo; echo 'Checking npm latest'; \\(sks) update check; echo; echo 'SKS version check finished. Close this window when ready.'")
    }

    @objc func updateSksNow() {
        runSks(["update"], tail: "echo; echo 'SKS update finished. Close this window when ready.'")
    }

    @objc func openCodexSettings() {
        runDetached("/usr/bin/open", ["codex://settings"])
    }

    @objc func restartCodex() {
        runInTerminal("/usr/bin/osascript -e 'tell application \\"Codex\\" to quit'; sleep 1; /usr/bin/open -a Codex; echo 'Codex restart requested.'")
    }

    @objc func quit() {
        NSApplication.shared.terminate(nil)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
`;
}

function infoPlistSource() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>SKSMenuBar</string>
  <key>CFBundleIdentifier</key>
  <string>${LABEL}</string>
  <key>CFBundleName</key>
  <string>SKS Menu Bar</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSUIElement</key>
  <true/>
</dict>
</plist>
`;
}

function launchAgentSource(executablePath: string, installDir: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(executablePath)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(path.join(installDir, 'menubar.out.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(path.join(installDir, 'menubar.err.log'))}</string>
</dict>
</plist>
`;
}

async function launchWithLaunchctl(input: {
  launchctl: string;
  open: string | null;
  appPath: string;
  executablePath: string;
  launchAgentPath: string;
}): Promise<NonNullable<SksMenuBarInstallResult['launch']>> {
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  const domain = uid === null ? 'gui' : `gui/${uid}`;
  await runProcess(input.launchctl, ['bootout', `${domain}/${LABEL}`], { timeoutMs: 5_000, maxOutputBytes: 16 * 1024 }).catch(() => undefined);
  await runProcess(input.launchctl, ['bootout', domain, input.launchAgentPath], { timeoutMs: 5_000, maxOutputBytes: 16 * 1024 }).catch(() => undefined);
  await terminateExistingMenuBarProcess(input.executablePath);
  const bootstrap = await runProcess(input.launchctl, ['bootstrap', domain, input.launchAgentPath], {
    timeoutMs: 10_000,
    maxOutputBytes: 32 * 1024
  }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
  if (bootstrap.code === 0) {
    const kickstart = await runProcess(input.launchctl, ['kickstart', '-k', `${domain}/${LABEL}`], {
      timeoutMs: 5_000,
      maxOutputBytes: 32 * 1024
    }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
    if (kickstart.code !== 0) {
      const printed = await waitForLaunchctlRunning(input.launchctl, `${domain}/${LABEL}`);
      if (printed.running) {
        return {
          requested: true,
          method: 'launchctl',
          ok: true,
          bootstrap_code: bootstrap.code,
          kickstart_code: kickstart.code,
          print_code: printed.code,
          error: null
        };
      }
    }
    return {
      requested: true,
      method: 'launchctl',
      ok: kickstart.code === 0,
      bootstrap_code: bootstrap.code,
      kickstart_code: kickstart.code,
      error: kickstart.code === 0 ? null : String(kickstart.stderr || kickstart.stdout || '').trim() || 'launchctl_kickstart_failed'
    };
  }
  if (input.open) {
    const opened = await runProcess(input.open, [input.appPath], {
      timeoutMs: 10_000,
      maxOutputBytes: 32 * 1024
    }).catch((err: any) => ({ code: 1, stdout: '', stderr: err?.message || String(err) }));
    return {
      requested: true,
      method: 'open-fallback',
      ok: opened.code === 0,
      bootstrap_code: bootstrap.code,
      open_code: opened.code,
      error: opened.code === 0
        ? null
        : String(opened.stderr || opened.stdout || bootstrap.stderr || bootstrap.stdout || '').trim() || 'sks_menubar_launch_failed'
    };
  }
  return {
    requested: true,
    method: 'launchctl',
    ok: false,
    bootstrap_code: bootstrap.code,
    error: String(bootstrap.stderr || bootstrap.stdout || '').trim() || 'launchctl_bootstrap_failed'
  };
}

async function waitForLaunchctlRunning(launchctl: string, service: string): Promise<{ code: number | null; running: boolean }> {
  let lastCode: number | null = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const printed = await runProcess(launchctl, ['print', service], {
      timeoutMs: 2_000,
      maxOutputBytes: 64 * 1024
    }).catch(() => ({ code: 1, stdout: '', stderr: '' }));
    lastCode = printed.code;
    if (printed.code === 0 && /\bstate = running\b|\bpid = \d+\b/.test(`${printed.stdout || ''}\n${printed.stderr || ''}`)) {
      return { code: printed.code, running: true };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { code: lastCode, running: false };
}

async function terminateExistingMenuBarProcess(executablePath: string): Promise<void> {
  const pkill = await which('pkill').catch(() => null) || await fallbackTool('/usr/bin/pkill');
  if (!pkill) return;
  await runProcess(pkill, ['-f', executablePath], { timeoutMs: 5_000, maxOutputBytes: 8 * 1024 }).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 250));
}

function swiftString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
