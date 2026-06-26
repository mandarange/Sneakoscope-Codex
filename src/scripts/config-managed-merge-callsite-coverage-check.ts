#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js';

interface SourceFile {
  file: string;
  text: string;
}

interface ProtectedWriteCallsite {
  file: string;
  line: number;
  source: string;
  window: string;
  indicators: string[];
}

interface AllowEntry {
  file: string;
  pattern: RegExp;
  reason: string;
  expires: string;
}

const SCAN_DIRS = ['src/core', 'src/commands', 'src/cli'];
const WRITE_CALL = /\b(?:writeTextAtomic|writeJsonAtomic|fs\.writeFile|fsp\.writeFile|writeFileSync|copyFile)\s*\(/;
const PROTECTED_INDICATORS: Array<[string, RegExp]> = [
  ['codex-config-toml', /(?:config\.toml|generatedCodexConfigPath|codexLbConfigPath|\bconfigPath\b)/],
  ['codex-auth-json', /(?:auth\.json|\bauthPath\b|codexAuthPath)/],
  ['env-secret-file', /(?:(?:['"`][^'"`]*\.env[^'"`]*['"`])|sks-codex-lb\.env|\benvPath\b|status\.env_path|codexLbEnvPath)/],
  ['mcp-json', /(?:mcp\.json|\bmcpPath\b|cursorMcpPath)/],
  ['sneakoscope-config', /(?:\.sneakoscope\/config\.json|sneakoscopeConfigPath)/]
];

const ALLOWLIST: AllowEntry[] = [
  {
    file: 'src/core/config/managed-config-merge.ts',
    pattern: /writeTextAtomic|fs\.writeFile/,
    reason: 'central managed config merge writer preserves protected keys and secret line hashes',
    expires: '3.2.0'
  },
  {
    file: 'src/core/config/secret-preservation.ts',
    pattern: /writeTextAtomic|writeJsonAtomic|fs\.writeFile/,
    reason: 'secret preservation guard backup, rollback, and sanitized report writer',
    expires: '3.2.0'
  },
  {
    file: 'src/core/init.ts',
    pattern: /generatedCodexConfigPath|\.codex['"], ['"]SNEAKOSCOPE\.md|hooksPath|mergeManagedHookTrustStateToml/,
    reason: 'setup/init harness writes run through setup-command or doctor-fix secret preservation guard',
    expires: '3.2.0'
  },
  {
    file: 'src/commands/doctor.ts',
    pattern: /backupProjectConfigBeforeFix|writeTextAtomic|fsp\.writeFile|config_backup_path/,
    reason: 'doctor --fix wraps runDoctor in secret preservation guard before project config repair',
    expires: '3.2.0'
  },
  {
    file: 'src/core/doctor/doctor-context7-repair.ts',
    pattern: /backupConfig|writeTextAtomic|CONTEXT7_REMOTE_URL/,
    reason: 'doctor Context7 repair writes a backup before replacing only the local stdio Context7 MCP block with the remote endpoint',
    expires: '3.2.0'
  },
  {
    file: 'src/core/doctor/doctor-codex-startup-repair.ts',
    pattern: /backupConfig|writeTextAtomic|doctor-codex-startup-repair/,
    reason: 'doctor startup repair writes backups before fixing stale Codex agent config_file paths and removing only missing-command MCP blocks',
    expires: '3.2.0'
  },
  {
    file: 'src/core/auto-review.ts',
    pattern: /writeTextAtomic|writeProfileConfig|configPath/,
    reason: 'auto-review profile migration rewrites bounded Codex profile tables while preserving non-profile config text',
    expires: '3.2.0'
  },
  {
    file: 'src/cli/context7-command.ts',
    pattern: /writeTextAtomic|configPath/,
    reason: 'explicit context7 setup appends non-secret MCP config and preserves existing secret lines',
    expires: '3.2.0'
  },
  {
    file: 'src/cli/xai-command.ts',
    pattern: /writeTextAtomic|configPath/,
    reason: 'explicit xAI setup appends MCP config and references env var names rather than raw secret values',
    expires: '3.2.0'
  },
  {
    file: 'src/cli/install-helpers.ts',
    pattern: /writeTextAtomic|writeJsonAtomic|envPath|authPath|configPath|codexLbEnvPath|codexLbConfigPath|codexAuthPath/,
    reason: 'postinstall/codex-lb setup callsites are covered by setup/update/doctor secret preservation guard fixtures',
    expires: '3.2.0'
  },
  {
    file: 'src/core/codex/codex-config-eperm-repair.ts',
    pattern: /writeTextAtomic|configPath/,
    reason: 'doctor config repair runs inside doctor-fix secret preservation guard',
    expires: '3.2.0'
  },
  {
    file: 'src/core/codex/agent-config-file-repair.ts',
    pattern: /writeTextAtomic|configPath|missingAgentConfigFiles/,
    reason: 'agent config_file repair rewrites only the project .codex/config.toml agent config_file paths and is covered by doctor/setup secret preservation fixtures',
    expires: '3.2.0'
  },
  {
    file: 'src/core/codex/codex-project-config-policy.ts',
    pattern: /writeTextAtomic|configPath/,
    reason: 'project config policy splitter preserves existing protected config content',
    expires: '3.2.0'
  },
  {
    file: 'src/core/codex-app/codex-app-fast-ui-repair.ts',
    pattern: /writeTextAtomic|configPath/,
    reason: 'Codex App fast UI repair is invoked from guarded doctor/setup flows',
    expires: '3.2.0'
  },
  {
    file: 'src/core/codex-control/codex-task-runner.ts',
    pattern: /ensurePythonCodexLbConfig|CODEX_LB_API_KEY|config\.toml/,
    reason: 'Python Codex task runner writes an isolated CODEX_HOME provider config referencing env_key only',
    expires: '3.2.0'
  },
  {
    file: 'src/core/codex-lb/codex-lb-setup.ts',
    pattern: /installCodexLbShellProfileSnippet|upsertManagedBlock|envPath/,
    reason: 'codex-lb shell profile setup writes a managed source block pointing at an env file, not the raw key',
    expires: '3.2.0'
  },
  {
    file: 'src/core/migration/migration-transaction-journal.ts',
    pattern: /writeJsonAtomic|writeTextAtomic/,
    reason: 'migration journal writes hashes and rollback metadata, not raw secret config values',
    expires: '3.2.0'
  },
  {
    file: 'src/core/mad-db/mad-db-runtime-profile.ts',
    pattern: /codex-mad-db\.config\.toml|writeTextAtomic/,
    reason: 'MAD-DB runtime profile writes only a mission-local temporary Codex profile and verifies read-only restoration on close',
    expires: '4.6.0'
  },
  {
    file: 'src/core/providers/glm/naruto/glm-naruto-trace.ts',
    pattern: /mission-result\.json|sanitizeArtifact/,
    reason: 'GLM Naruto trace writer persists sanitized mission-result proof artifacts, not raw env secret files',
    expires: '4.6.0'
  }
];

const sources = listSourceFiles().map((file) => ({
  file,
  text: fs.readFileSync(path.join(root, file), 'utf8')
}));
const suspicious = findProtectedWriteCallsites(sources);
const uncovered = suspicious.filter((callsite) => !allowFor(callsite));
const negative = findProtectedWriteCallsites([{
  file: 'fixture/unprotected-config-write.ts',
  text: "await writeTextAtomic(path.join(root, '.codex', 'config.toml'), 'model = \"x\"\\n');\n"
}]);

const report = {
  schema: 'sks.config-managed-merge-callsite-coverage.v1',
  ok: uncovered.length === 0 && negative.length === 1 && !allowFor(negative[0]),
  scanned_dirs: SCAN_DIRS,
  protected_write_callsites: suspicious.length,
  allowlist_entries: ALLOWLIST.map((entry) => ({
    file: entry.file,
    pattern: String(entry.pattern),
    reason: entry.reason,
    expires: entry.expires
  })),
  uncovered,
  negative_fixture_detected: negative.length === 1,
  generated_at: new Date().toISOString()
};
fs.mkdirSync(path.join(root, '.sneakoscope', 'reports'), { recursive: true });
fs.writeFileSync(path.join(root, '.sneakoscope', 'reports', 'config-managed-merge-callsite-coverage.json'), `${JSON.stringify(report, null, 2)}\n`);

assertGate(report.ok, 'managed config merge callsite coverage failed', report);
emitGate('config:managed-merge-callsite-coverage', {
  protected_write_callsites: suspicious.length,
  allowlist_entries: ALLOWLIST.length
});

export function findProtectedWriteCallsites(files: SourceFile[]): ProtectedWriteCallsite[] {
  const calls: ProtectedWriteCallsite[] = [];
  for (const sourceFile of files) {
    const lines = sourceFile.text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] || '';
      if (!WRITE_CALL.test(line)) continue;
      const window = lines.slice(Math.max(0, index - 3), Math.min(lines.length, index + 4)).join('\n');
      const indicators = PROTECTED_INDICATORS.filter(([, pattern]) => pattern.test(window)).map(([name]) => name);
      if (!indicators.length) continue;
      calls.push({
        file: sourceFile.file,
        line: index + 1,
        source: line.trim(),
        window,
        indicators
      });
    }
  }
  return calls;
}

function allowFor(callsite: ProtectedWriteCallsite | undefined): AllowEntry | null {
  if (!callsite) return null;
  const text = `${callsite.source}\n${callsite.window}`;
  return ALLOWLIST.find((entry) => entry.file === callsite.file && entry.pattern.test(text)) || null;
}

function listSourceFiles(): string[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) collectTsFiles(path.join(root, dir), files);
  return files.sort();
}

function collectTsFiles(dir: string, out: string[]): void {
  const rows = fs.readdirSync(dir, { withFileTypes: true });
  for (const row of rows) {
    const abs = path.join(dir, row.name);
    const rel = path.relative(root, abs);
    if (row.isDirectory()) {
      if (row.name === 'scripts' || row.name === 'node_modules' || row.name === 'dist') continue;
      collectTsFiles(abs, out);
      continue;
    }
    if (row.isFile() && row.name.endsWith('.ts')) out.push(rel);
  }
}
