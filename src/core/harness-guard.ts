import path from 'node:path';
import fsp from 'node:fs/promises';
import { appendJsonlBounded, exists, nowIso, readJson, readText, sha256, writeJsonAtomic } from './fsx.js';
import { SHELL_TOOL_RE } from './hooks-runtime/shell-tool-name.js';

export const HARNESS_GUARD_PATH = '.sneakoscope/harness-guard.json';

export const HARNESS_STATIC_FILES = [
  '.codex/config.toml',
  '.codex/hooks.json',
  '.codex/SNEAKOSCOPE.md',
  'AGENTS.md',
  '.sneakoscope/manifest.json',
  '.sneakoscope/policy.json',
  '.sneakoscope/db-safety.json',
  HARNESS_GUARD_PATH
];

export const HARNESS_STATIC_DIRS = [
  '.agents/skills',
  '.codex/agents',
  'node_modules/sneakoscope'
];

export const HARNESS_RUNTIME_MUTABLE = [
  '.sneakoscope/state',
  '.sneakoscope/missions',
  '.sneakoscope/reports',
  '.sneakoscope/tmp',
  '.sneakoscope/wiki',
  '.sneakoscope/gx/cartridges',
  '.sneakoscope/hproof',
  '.sneakoscope/db-safety-scan.json'
];

export async function isHarnessSourceProject(root: any) {
  const pkg = await readJson(path.join(root, 'package.json'), null);
  return pkg?.name === 'sneakoscope'
    && await exists(path.join(root, 'src', 'bin', 'sks.ts'))
    && await exists(path.join(root, 'src', 'core', 'init.ts'))
    && await exists(path.join(root, 'src', 'core', 'hooks-runtime.ts'));
}

export async function writeHarnessGuardPolicy(root: any, opts: any = {}) {
  const sourceException = opts.engineSourceException ?? await isHarnessSourceProject(root);
  const policy = {
    schema_version: 1,
    enabled: true,
    locked: !sourceException,
    engine_source_exception: sourceException,
    engine_source_detection: 'package.name=sneakoscope + src/bin/sks.ts + src/core/init.ts + src/core/hooks-runtime.ts',
    rule: 'LLM tool calls must not modify installed Sneakoscope harness control files. Agents must never run `sks doctor --fix`; ask the user to run it in their own terminal when repair is needed.',
    protected_files: HARNESS_STATIC_FILES,
    protected_dirs: HARNESS_STATIC_DIRS,
    runtime_mutable_paths: HARNESS_RUNTIME_MUTABLE,
    blocked_maintenance_commands: [
      'sks setup/init/fix-path',
      'sks doctor --fix (operator-only; agents must ask the user)',
      'sks context7 setup',
      'npm remove/uninstall sneakoscope'
    ],
    fingerprints: await collectHarnessFingerprints(root),
    updated_at: nowIso()
  };
  await writeJsonAtomic(path.join(root, HARNESS_GUARD_PATH), policy);
  return policy;
}

export async function loadHarnessGuardPolicy(root: any) {
  const policy = await readJson(path.join(root, HARNESS_GUARD_PATH), null);
  const sourceException = await isHarnessSourceProject(root);
  return {
    schema_version: 1,
    enabled: true,
    locked: !sourceException,
    engine_source_exception: sourceException,
    protected_files: HARNESS_STATIC_FILES,
    protected_dirs: HARNESS_STATIC_DIRS,
    runtime_mutable_paths: HARNESS_RUNTIME_MUTABLE,
    fingerprints: {},
    ...(policy || {})
  };
}

export async function harnessGuardStatus(root: any) {
  const policyPath = path.join(root, HARNESS_GUARD_PATH);
  const existsPolicy = await exists(policyPath);
  const policy = await loadHarnessGuardPolicy(root);
  const sourceException = await isHarnessSourceProject(root);
  const current = await collectHarnessFingerprints(root);
  const expected = policy.fingerprints || {};
  const missing: any[] = [];
  const changed: any[] = [];
  for (const [file, hash] of Object.entries(expected)) {
    if (!current[file]) missing.push(file);
    else if (current[file] !== hash) changed.push(file);
  }
  return {
    ok: sourceException || (existsPolicy && policy.enabled && policy.locked && missing.length === 0 && changed.length === 0),
    source_exception: sourceException,
    policy_path: HARNESS_GUARD_PATH,
    policy_exists: existsPolicy,
    locked: Boolean(policy.locked),
    protected_files: policy.protected_files || HARNESS_STATIC_FILES,
    protected_dirs: policy.protected_dirs || HARNESS_STATIC_DIRS,
    fingerprints_checked: Object.keys(expected).length,
    missing,
    changed
  };
}

export async function checkHarnessModification(root: any, payload: any = {}, opts: any = {}) {
  const policy = await loadHarnessGuardPolicy(root);
  const classification = classifyHarnessPayload(root, payload, policy);
  // Operator-only: agents must never self-run doctor --fix, including in the
  // Sneakoscope engine source repo where other harness writes remain allowed.
  if ((classification.reasons || []).includes('sks_doctor_fix_blocked')) {
    const decision = {
      action: 'block',
      reasons: ['sks_doctor_fix_blocked'],
      matches: classification.matches,
      command: classification.command,
      tool: classification.toolName
    };
    await appendJsonlBounded(path.join(root, '.sneakoscope', 'state', 'harness-guard.jsonl'), {
      ts: nowIso(),
      decision,
      payload_keys: Object.keys(payload || {}).sort()
    }).catch(() => {});
    return decision;
  }
  if (!policy.enabled || !policy.locked || policy.engine_source_exception || await isHarnessSourceProject(root)) {
    return { action: 'allow', reason: 'harness_source_exception_or_unlocked' };
  }
  if (classification.block) {
    const decision = { action: 'block', reasons: classification.reasons, matches: classification.matches, command: classification.command, tool: classification.toolName };
    await appendJsonlBounded(path.join(root, '.sneakoscope', 'state', 'harness-guard.jsonl'), { ts: nowIso(), decision, payload_keys: Object.keys(payload || {}).sort() }).catch(() => {});
    return decision;
  }
  return { action: 'allow', classification };
}

export function harnessGuardBlockReason(decision: any = {}) {
  if ((decision.reasons || []).includes('sks_doctor_fix_blocked')) {
    return 'SKS agents must not run `sks doctor --fix`. Ask the user to run `sks doctor --fix` in their own terminal when repair is needed, then continue after they confirm.';
  }
  const matches = (decision.matches || []).slice(0, 6).join(', ');
  return `SKS harness guard blocked this tool call. Installed Sneakoscope harness files are immutable to LLM edits after setup${matches ? `: ${matches}` : ''}. Use manual terminal maintenance or update/reinstall SKS outside the agent. This repository is editable only when it is the Sneakoscope engine source repo.`;
}

export function classifyHarnessPayload(root: any, payload: any = {}, policy: any = {}) {
  const strings = collectPayloadStrings(payload).slice(0, 300);
  const hay = strings.join('\n');
  const toolName = [payload.tool_name, payload.toolName, payload.name, payload.tool?.name, payload.server, payload.mcp_tool, payload.tool, payload.type].filter(Boolean).join(' ').toLowerCase();
  const command = extractCommand(payload);
  // Only a shell tool executes its command text. Any other tool's payload (a patch body, a search pattern, a goal)
  // merely mentions a maintenance command, so it is never classified.
  const executed = SHELL_TOOL_RE.test(String(payload.tool_name || payload.toolName || payload.tool?.name || payload.name || '').trim()) ? command : '';
  const maintenance = classifyMaintenanceCommand(executed);
  const writeIntent = maintenance.block || hasWriteIntent(toolName, command, hay);
  const writeTargets = extractWriteTargets(root, payload, strings, command);
  const protectedMatches = findProtectedMatches(root, writeTargets.length ? writeTargets : strings, policy);
  const packageEdit = writeIntent && packageManifestEditDetected(writeTargets, hay);
  const block = maintenance.block || packageEdit || (writeIntent && protectedMatches.length > 0);
  const reasons: any[] = [];
  if (maintenance.block) reasons.push(...maintenance.reasons);
  if (packageEdit) reasons.push('package_manifest_sneakoscope_edit_blocked');
  if (writeIntent && protectedMatches.length) reasons.push('protected_harness_path_write_blocked');
  return { block, reasons: [...new Set(reasons)], matches: protectedMatches, writeIntent, toolName, command, writeTargets };
}

export async function collectHarnessFingerprints(root: any) {
  const out: Record<string, string> = {};
  for (const rel of HARNESS_STATIC_FILES) {
    if (rel === HARNESS_GUARD_PATH) continue;
    const abs = path.join(root, rel);
    if (await exists(abs)) out[rel] = sha256(await readText(abs, ''));
  }
  for (const rel of HARNESS_STATIC_DIRS) {
    const abs = path.join(root, rel);
    if (!(await exists(abs))) continue;
    for (const file of await listFiles(abs)) {
      const r = toRel(root, file);
      out[r] = sha256(await readText(file, ''));
    }
  }
  return Object.fromEntries(Object.entries(out).sort(([a]: any, [b]: any) => a.localeCompare(b)));
}

async function listFiles(dir: any) {
  const out: any[] = [];
  let entries: any[] = [];
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listFiles(p));
    else if (entry.isFile()) out.push(p);
  }
  return out;
}

// Bash and apply_patch carry the text in `command`; `exec_command` names it `cmd`.
function extractCommand(payload: any = {}) {
  for (const holder of [payload, payload.tool_input, payload.toolInput, payload.input, payload.tool?.input]) {
    const raw = holder?.command || holder?.cmd;
    if (raw) return raw;
  }
  return '';
}

function collectPayloadStrings(obj: any, out: any = [], depth: any = 0) {
  if (depth > 10 || obj == null) return out;
  if (typeof obj === 'string') { out.push(obj); return out; }
  if (Array.isArray(obj)) { for (const x of obj) collectPayloadStrings(x, out, depth + 1); return out; }
  if (typeof obj === 'object') {
    for (const v of Object.values(obj)) collectPayloadStrings(v, out, depth + 1);
  }
  return out;
}

function extractWriteTargets(root: any, payload: any = {}, strings: any[] = [], command: any = '') {
  const targets = new Set<string>();
  for (const value of collectPathFieldStrings(payload)) addWriteTarget(root, targets, value);
  for (const text of [command, ...strings]) {
    const s = String(text || '');
    for (const match of s.matchAll(/^\*\*\*\s+(?:Update|Add|Delete)\s+File:\s+(.+)$/gmi)) addWriteTarget(root, targets, match[1]);
    for (const match of s.matchAll(/^\*\*\*\s+Move to:\s+(.+)$/gmi)) addWriteTarget(root, targets, match[1]);
    for (const match of s.matchAll(/>{1,2}\s*(['"]?)([^\s;&|'"`]+)\1/g)) addWriteTarget(root, targets, match[2]);
    collectShellCommandTargets(root, targets, s);
  }
  return [...targets].sort();
}

function collectPathFieldStrings(obj: any, out: any = [], depth: any = 0) {
  if (depth > 8 || obj == null) return out;
  if (Array.isArray(obj)) {
    for (const value of obj) collectPathFieldStrings(value, out, depth + 1);
    return out;
  }
  if (typeof obj !== 'object') return out;
  for (const [key, value] of Object.entries(obj)) {
    const normalized = String(key || '').toLowerCase();
    if (typeof value === 'string' && /^(?:path|file|filename|target|source|destination|dest|to|from|cwd|workdir|file_path|target_path|output_path|artifact_path)$/.test(normalized)) out.push(value);
    collectPathFieldStrings(value, out, depth + 1);
  }
  return out;
}

function collectShellCommandTargets(root: any, targets: Set<string>, text: string) {
  const words = shellWords(text);
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i] || '';
    if (!/^(?:rm|rmdir|mv|cp|touch|mkdir|chmod|chown)$/.test(word)) continue;
    for (let j = i + 1; j < words.length; j += 1) {
      const candidate = words[j] || '';
      if (!candidate || candidate.startsWith('-')) continue;
      if (/^(?:&&|\|\||;|\|)$/.test(candidate)) break;
      if (/^(?:rm|rmdir|mv|cp|touch|mkdir|chmod|chown|git|npm|node|python\d?)$/.test(candidate) && j > i + 1) break;
      addWriteTarget(root, targets, candidate);
    }
  }
}

function shellWords(text: string) {
  return [...String(text || '').matchAll(/"([^"]*)"|'([^']*)'|([^\s]+)/g)].map((match) => match[1] || match[2] || match[3]).filter(Boolean);
}

function addWriteTarget(root: any, targets: Set<string>, value: any) {
  const normalized = normalizeTargetPath(root, value);
  if (normalized) targets.add(normalized);
}

function normalizeTargetPath(root: any, value: any) {
  let s = String(value || '').trim();
  if (!s) return '';
  s = s.replace(/^['"`<]+|['"`>,]+$/g, '');
  if (!s || /^\$[\w{]/.test(s) || /^[A-Z_][A-Z0-9_]*=/.test(s)) return '';
  if (/^(?:--?|&&|\|\||;|\|)$/.test(s)) return '';
  s = s.replace(/\\/g, '/');
  if (s.startsWith('a/') || s.startsWith('b/')) s = s.slice(2);
  if (s.startsWith('./')) s = s.slice(2);
  const rootNorm = String(root || '').replace(/\\/g, '/').replace(/\/$/, '');
  if (rootNorm && s.startsWith(`${rootNorm}/`)) s = s.slice(rootNorm.length + 1);
  return s.replace(/\/$/, '');
}

function packageManifestEditDetected(writeTargets: string[], hay: string) {
  const hasPackageTarget = writeTargets.length > 0
    ? writeTargets.some((target) => /(^|\/)(?:package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(target))
    : /\b(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)\b/i.test(hay);
  return hasPackageTarget && /\bsneakoscope\b/i.test(hay);
}

// A write verb as a whole `_`-separated word of a tool name's last `__` / `.` segment. `\b` cannot do this: `_` is a word character,
// so it never separates `write` in `mcp__filesystem__write_file`.
const WRITE_TOOL_NAME_RE = /(^|_)(?:write|edit|create|delete|remove|rename|move|str_replace|apply_patch)(_|$)/;

function writeToolName(toolName: string) {
  return toolName.split(/\s+/).some((name) => WRITE_TOOL_NAME_RE.test(name.split(/__|\./).pop() || ''));
}

function hasWriteIntent(toolName: any, command: any, hay: any) {
  if (/\b(apply_patch|edit|write|create|delete|remove|rename|str_replace|file_write|fs_write)\b/i.test(toolName) || writeToolName(String(toolName))) return true;
  const c = String(command || hay || '');
  return /(^|[\s;&|])(?:rm|mv|cp|touch|chmod|chown|mkdir|rmdir|tee)\b/i.test(c)
    || /\b(?:sed\s+-i|perl\s+-pi|python\d?\s+-c|node\s+-e)\b/i.test(c)
    || />{1,2}\s*(?:\.\/)?(?:\.codex|\.agents|\.sneakoscope|AGENTS\.md|package(?:-lock)?\.json)\b/i.test(c)
    || /\*\*\*\s+(?:Update|Add|Delete|Move to)\s+File:/i.test(c);
}

const COMMAND_WRAPPERS = new Set(['sudo', 'env', 'time', 'command', 'exec', 'nohup', 'nice']);

/**
 * The simple commands of a shell command line, each as its unquoted words. A quoted string is one word and a heredoc
 * body is dropped, so a search pattern or a document that only mentions `sks doctor --fix` is not a command.
 */
function simpleCommands(text: string): string[][] {
  const commands: string[][] = [];
  let words: string[] = [];
  let word: string | null = null;
  let quote: string | null = null;
  const heredocs: string[] = [];
  const endWord = () => { if (word !== null) words.push(word); word = null; };
  const endCommand = () => { endWord(); if (words.length) commands.push(words); words = []; };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] || '';
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"') word = `${word ?? ''}${text[++i] ?? ''}`;
      else word = `${word ?? ''}${ch}`;
    } else if (ch === '\\') {
      word = `${word ?? ''}${text[++i] ?? ''}`;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      word = word ?? '';
    } else if (ch === '#' && word === null) {
      while (i + 1 < text.length && text[i + 1] !== '\n') i += 1;
    } else if (ch === '<' && text[i + 1] === '<' && text[i + 2] !== '<') {
      const tag = /^-?\s*(?:(["'])([A-Za-z_][\w.-]*)\1|([A-Za-z_][\w.-]*))/.exec(text.slice(i + 2));
      if (tag) {
        heredocs.push(tag[2] || tag[3] || '');
        i += 1 + tag[0].length;
      }
      endWord();
    } else if (ch === '\n') {
      endCommand();
      let body = i + 1;
      for (const tag of heredocs.splice(0)) {
        const lines = text.slice(body).split('\n');
        const end = lines.findIndex((line) => line.trim() === tag);
        body = end < 0 ? text.length : body + lines.slice(0, end + 1).join('\n').length + 1;
      }
      i = body - 1;
    } else if (';&|()`'.includes(ch)) {
      endCommand();
    } else if (/\s/.test(ch)) {
      endWord();
    } else {
      word = `${word ?? ''}${ch}`;
    }
  }
  endCommand();
  return commands;
}

/** The program a simple command runs (past env assignments and wrappers such as `sudo`) and its arguments. */
function programAndArgs(words: string[]) {
  let i = 0;
  let wrapped = false;
  for (; i < words.length; i += 1) {
    const word = words[i] || '';
    if (/^[A-Za-z_]\w*=/.test(word)) continue;
    if (COMMAND_WRAPPERS.has(path.basename(word))) wrapped = true;
    else if (!(wrapped && word.startsWith('-'))) break;
  }
  return { program: path.basename(words[i] || ''), args: words.slice(i + 1) };
}

/** The arguments after `sks` for `sks`, `sneakoscope`, `node …/sks.js`, and `npx [-y] [-p pkg] sks`; null for any other command. */
function sksArgs({ program, args }: { program: string; args: string[] }) {
  if (program === 'sks' || program === 'sneakoscope') return args;
  if (program === 'node' && /(^|\/)sks\.js$/.test(args[0] || '')) return args.slice(1);
  if (program !== 'npx') return null;
  let i = 0;
  while (i < args.length && (args[i] || '').startsWith('-')) i += args[i] === '-p' || args[i] === '--package' ? 2 : 1;
  return args[i] === 'sks' ? args.slice(i + 1) : null;
}

/** Maintenance commands the agent must not run, matched per simple command: one that quotes or embeds the text does not count. */
function classifyMaintenanceCommand(command: any = '') {
  const reasons = new Set<string>();
  for (const words of simpleCommands(String(command || '').toLowerCase())) {
    const run = programAndArgs(words);
    const sks = sksArgs(run);
    if (sks) {
      if (['setup', 'init', 'fix-path'].includes(sks[0] || '')) reasons.add('sks_harness_maintenance_command_blocked');
      if (sks[0] === 'doctor' && sks.some((arg) => arg === '--fix' || arg.startsWith('--fix='))) reasons.add('sks_doctor_fix_blocked');
      if (sks[0] === 'context7' && sks[1] === 'setup') reasons.add('sks_context7_setup_blocked');
    }
    const removeVerbs = run.program === 'npm' ? ['remove', 'rm', 'uninstall'] : run.program === 'pnpm' || run.program === 'yarn' ? ['remove', 'uninstall'] : [];
    if (removeVerbs.includes(run.args[0] || '') && run.args.slice(1).some((arg) => /\bsneakoscope\b/.test(arg))) reasons.add('sneakoscope_uninstall_blocked');
  }
  return { block: reasons.size > 0, reasons: [...reasons] };
}

function findProtectedMatches(root: any, strings: any, policy: any) {
  const rels = [...(policy.protected_files || HARNESS_STATIC_FILES), ...(policy.protected_dirs || HARNESS_STATIC_DIRS)];
  const matches = new Set();
  const normalizedTexts = strings.map((s: any) => String(s || '').replace(/\\/g, '/'));
  for (const rel of rels) {
    const normalizedRel = rel.replace(/\\/g, '/').replace(/\/$/, '');
    const abs = path.join(root, rel).replace(/\\/g, '/').replace(/\/$/, '');
    for (const text of normalizedTexts) {
      if (text.includes(normalizedRel) || text.includes(`./${normalizedRel}`) || text.includes(abs)) matches.add(rel);
    }
  }
  return [...matches].sort();
}

function toRel(root: any, file: any) {
  return path.relative(root, file).split(path.sep).join('/');
}
