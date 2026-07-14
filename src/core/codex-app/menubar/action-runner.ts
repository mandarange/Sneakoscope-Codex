import fs from 'node:fs/promises';
import { exists, runProcess } from '../../fsx.js';

export function actionScriptSource(input: { nodeBin: string; sksEntry: string }) {
  return `#!/bin/zsh
set -e
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
cd "$HOME" 2>/dev/null || true
export SKS_UPDATE_MIGRATION_GATE_DISABLED=1
NODE_BIN=${shellQuote(input.nodeBin)}
SKS_ENTRY=${shellQuote(input.sksEntry)}

resolve_node_bin() {
  if [ -x "$NODE_BIN" ]; then printf '%s\\n' "$NODE_BIN"; return 0; fi
  for cand in "$HOME"/.nvm/versions/node/*/bin/node(Nn[-1]); do
    if [ -x "$cand" ]; then printf '%s\\n' "$cand"; return 0; fi
  done
  local login_node
  login_node="$(/bin/zsh -lc 'command -v node' 2>/dev/null | /usr/bin/head -n 1 || true)"
  if [ -n "$login_node" ] && [ -x "$login_node" ]; then printf '%s\\n' "$login_node"; return 0; fi
  for cand in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
    if [ -x "$cand" ]; then printf '%s\\n' "$cand"; return 0; fi
  done
  return 1
}

run_node_entry() {
  local entry="$1"; shift
  [ -f "$entry" ] || return 1
  local node_bin
  node_bin="$(resolve_node_bin || true)"
  [ -n "$node_bin" ] || return 1
  local node_bin_dir
  node_bin_dir="$(/usr/bin/dirname "$node_bin")"
  [ -d "$node_bin_dir" ] && export PATH="$node_bin_dir:$PATH"
  exec "$node_bin" "$entry" "$@"
}

if [ -f "$SKS_ENTRY" ]; then run_node_entry "$SKS_ENTRY" "$@" || true; fi
SKS_BIN="$(/bin/zsh -lc 'command -v sks' 2>/dev/null | /usr/bin/head -n 1 || true)"
if [ -n "$SKS_BIN" ] && [ -x "$SKS_BIN" ]; then exec "$SKS_BIN" "$@"; fi
NPM_ROOT="$(/bin/zsh -lc 'npm root -g' 2>/dev/null | /usr/bin/head -n 1 || true)"
if [ -n "$NPM_ROOT" ]; then run_node_entry "$NPM_ROOT/sneakoscope/dist/bin/sks.js" "$@" || true; fi
for entry in "$HOME"/.nvm/versions/node/*/lib/node_modules/sneakoscope/dist/bin/sks.js(Nn[-1]) /opt/homebrew/lib/node_modules/sneakoscope/dist/bin/sks.js /usr/local/lib/node_modules/sneakoscope/dist/bin/sks.js; do
  [ -f "$entry" ] && run_node_entry "$entry" "$@" || true
done
echo "SKS command not found. Run npm install -g sneakoscope or sks doctor --fix, then try again." >&2
exit 127
`;
}

export async function smokeSksMenuBarAction(actionScriptPath: string): Promise<{
  ok: boolean; code: number | null; output: string | null; versionDetected: boolean;
  detectedVersion: string | null; executable: boolean;
}> {
  if (!(await exists(actionScriptPath))) return { ok: false, code: null, output: null, versionDetected: false, detectedVersion: null, executable: false };
  const executable = await fs.access(actionScriptPath, fs.constants.X_OK).then(() => true).catch(() => false);
  if (!executable) return { ok: false, code: null, output: 'action script is not executable (missing +x)', versionDetected: false, detectedVersion: null, executable: false };
  const result = await runProcess(actionScriptPath, ['version'], { timeoutMs: 5_000, maxOutputBytes: 16 * 1024 })
    .catch((error: unknown) => ({ code: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) }));
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  const detectedVersion = output.match(/\b(?:sks|sneakoscope)?\s*v?(\d+\.\d+\.\d+)\b/i)?.[1] || null;
  return {
    ok: result.code === 0 && Boolean(detectedVersion), code: result.code,
    output: output ? output.slice(0, 700) : null,
    versionDetected: Boolean(detectedVersion), detectedVersion, executable: true
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
