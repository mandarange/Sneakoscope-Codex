import path from 'node:path';
import { nowIso, packageRoot } from '../fsx.js';
import { evaluateProtectedCorePath } from './immutable-harness-guard.js';

export const MAD_SKS_SHELL_CLASSIFICATION_SCHEMA = 'sks.mad-sks-shell-classification.v1';

export interface MadSksShellClassification {
  schema: typeof MAD_SKS_SHELL_CLASSIFICATION_SCHEMA;
  ok: boolean;
  action: 'allow' | 'confirm' | 'block' | 'route';
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  argv: string[];
  command: string;
  cwd: string;
  target_root: string;
  metacharacters: string[];
  env_assignments: string[];
  absolute_path_tokens: string[];
  relative_path_tokens: string[];
  normalized_path_tokens: string[];
  protected_core_matches: unknown[];
  route_to_executor: null | 'package_install' | 'service_control' | 'db_write';
  dangerous_commands: string[];
  sql: { destructive: boolean; reasons: string[] };
  reasons: string[];
  generated_at: string;
}

const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun', 'cargo', 'pip', 'pip3']);
const SERVICE_COMMANDS = new Set(['systemctl', 'launchctl', 'service']);
const DB_COMMANDS = new Set(['psql', 'mysql', 'sqlite3', 'supabase', 'prisma']);
const PACKAGE_OPS: Record<string, Set<string>> = {
  npm: new Set(['install', 'i', 'add', 'remove', 'rm', 'uninstall', 'update']),
  pnpm: new Set(['install', 'i', 'add', 'remove', 'rm', 'uninstall', 'update']),
  yarn: new Set(['install', 'add', 'remove', 'upgrade']),
  bun: new Set(['install', 'add', 'remove', 'update']),
  cargo: new Set(['add', 'remove', 'update']),
  pip: new Set(['install', 'uninstall']),
  pip3: new Set(['install', 'uninstall'])
};

export async function classifyMadSksShellArgv({
  command = '',
  argv = null,
  cwd = process.cwd(),
  targetRoot = process.cwd(),
  root = packageRoot()
}: {
  command?: string;
  argv?: string[] | null;
  cwd?: string;
  targetRoot?: string;
  root?: string;
}): Promise<MadSksShellClassification> {
  const resolvedCwd = path.resolve(cwd || process.cwd());
  const resolvedTargetRoot = path.resolve(targetRoot || process.cwd());
  const parsed = Array.isArray(argv) && argv.length
    ? { argv: argv.map(String), metacharacters: [] as string[], envAssignments: argv.map(String).filter(isEnvAssignment) }
    : parseShellLike(command);
  const commandText = command || parsed.argv.join(' ');
  const reasons = new Set<string>();
  const dangerous = new Set<string>();
  const routeTo = routeForArgv(parsed.argv);

  for (const meta of parsed.metacharacters) {
    if (meta === ';') reasons.add('semicolon_chained_command');
    if (meta === '|') reasons.add('pipe_command');
    if (meta === '>' || meta === '<' || meta === '>>') reasons.add('redirect_command');
    if (meta === '$(') reasons.add('command_substitution');
    if (meta === '`') reasons.add('backtick_substitution');
    if (meta === '&' || meta === '&&' || meta === '||') reasons.add('chained_command');
  }
  if (parsed.envAssignments.length) reasons.add('environment_assignment');
  if (/\$[A-Za-z_][A-Za-z0-9_]*/.test(commandText.replace(/\$\([^)]*\)/g, ''))) reasons.add('environment_expansion');
  if (parsed.argv.some(hasGlobSyntax)) reasons.add('glob_expansion');

  const head = basename(parsed.argv[0] || '').toLowerCase();
  if (head === 'su' + 'do' || parsed.argv.includes('su' + 'do')) {
    reasons.add('admin_or_sudo');
    dangerous.add('sudo');
  }
  if (head === 'rm' && hasAny(parsed.argv, ['-r', '-rf', '-fr', '--recursive'])) {
    reasons.add('delete_command');
    dangerous.add('rm_recursive');
  }
  if (head === 'chmod') {
    reasons.add('file_permission_change');
    dangerous.add('chmod');
  }
  if (head === 'chown') {
    reasons.add('file_ownership_change');
    dangerous.add('chown');
  }
  if (head === 'git' && parsed.argv[1] === 'reset' && parsed.argv.includes('--hard')) {
    reasons.add('git_reset_hard');
    dangerous.add('git_reset_hard');
  }
  if (head === 'git' && parsed.argv[1] === 'clean') {
    reasons.add('git_clean');
    dangerous.add('git_clean');
  }

  const sql = classifySql(commandText);
  for (const reason of sql.reasons) reasons.add(reason);

  const pathTokens = extractPathTokens(parsed.argv, commandText);
  const absoluteTokens: string[] = [];
  const relativeTokens: string[] = [];
  const normalizedTokens: string[] = [];
  const protectedMatches = [];
  for (const token of pathTokens) {
    const normalized = normalizePathToken(token, { cwd: resolvedCwd, targetRoot: resolvedTargetRoot });
    if (!normalized) continue;
    normalizedTokens.push(normalized);
    if (path.isAbsolute(stripFileUrl(token))) absoluteTokens.push(token);
    else relativeTokens.push(token);
    const decision = await evaluateProtectedCorePath(normalized, { root, targetRoot: resolvedTargetRoot, operation: 'shell_command' });
    if (!decision.ok) protectedMatches.push(decision);
  }

  const cwdDecision = await evaluateProtectedCorePath(resolvedCwd, { root, targetRoot: resolvedTargetRoot, operation: 'shell_cwd' });
  if (!cwdDecision.ok) reasons.add('cwd_is_protected_core');
  if (!isInside(resolvedCwd, resolvedTargetRoot)) reasons.add('cwd_outside_target_root');
  if (protectedMatches.length) reasons.add('command_mentions_protected_core_path');

  const catastrophic = sql.destructive || protectedMatches.length > 0;
  const highRisk = [...reasons].some((reason) =>
    /sudo|delete|permission|ownership|git_reset|git_clean|cwd_is_protected|cwd_outside|chained|redirect|substitution|environment/.test(reason)
  );
  const action = catastrophic ? 'block' : routeTo ? 'route' : highRisk ? 'confirm' : 'allow';
  return {
    schema: MAD_SKS_SHELL_CLASSIFICATION_SCHEMA,
    ok: !catastrophic,
    action,
    risk_level: catastrophic ? 'critical' : highRisk ? 'high' : routeTo ? 'medium' : 'low',
    argv: parsed.argv,
    command: commandText,
    cwd: resolvedCwd,
    target_root: resolvedTargetRoot,
    metacharacters: parsed.metacharacters,
    env_assignments: parsed.envAssignments,
    absolute_path_tokens: absoluteTokens,
    relative_path_tokens: relativeTokens,
    normalized_path_tokens: normalizedTokens,
    protected_core_matches: protectedMatches,
    route_to_executor: routeTo,
    dangerous_commands: [...dangerous],
    sql,
    reasons: [...reasons],
    generated_at: nowIso()
  };
}

export function parseShellLike(command: string) {
  const argv: string[] = [];
  const metacharacters: string[] = [];
  const envAssignments: string[] = [];
  let token = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;
  const text = String(command || '');

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] || '';
    const two = text.slice(i, i + 2);
    if (escaping) {
      token += ch;
      escaping = false;
      continue;
    }
    if (ch === '\\') {
      escaping = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      else token += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (two === '$(') {
      flush();
      metacharacters.push('$(');
      i += 1;
      continue;
    }
    if (two === '&&' || two === '||' || two === '>>') {
      flush();
      metacharacters.push(two);
      i += 1;
      continue;
    }
    if (';|<>&`'.includes(ch)) {
      flush();
      metacharacters.push(ch);
      continue;
    }
    if (/\s/.test(ch)) {
      flush();
      continue;
    }
    token += ch;
  }
  flush();
  return { argv, metacharacters, envAssignments };

  function flush() {
    if (!token) return;
    argv.push(token);
    if (isEnvAssignment(token)) envAssignments.push(token);
    token = '';
  }
}

export function classifySql(text: string) {
  const lowered = String(text || '').toLowerCase();
  const reasons: string[] = [];
  if (/\bdrop\s+database\b/.test(lowered)) reasons.push('drop_database');
  if (/\bdrop\s+schema\b/.test(lowered)) reasons.push('drop_schema');
  if (/\bdrop\s+table\b/.test(lowered)) reasons.push('drop_table');
  if (/\btruncate(?:\s+table)?\b/.test(lowered)) reasons.push('truncate');
  if (/\bdelete\s+from\s+\S+\s*(?:;|$)/.test(lowered) && !/\bwhere\b/.test(lowered)) reasons.push('delete_without_where');
  if (/\bupdate\s+\S+\s+set\b/.test(lowered) && !/\bwhere\b/.test(lowered)) reasons.push('update_without_where');
  return { destructive: reasons.length > 0, reasons };
}

function routeForArgv(argv: string[]): MadSksShellClassification['route_to_executor'] {
  const head = basename(argv[0] || '').toLowerCase();
  if (head === 'brew' && argv[1] === 'services') return 'service_control';
  if (head === 'docker' && argv[1] === 'compose') return 'service_control';
  if (head === 'npm' && argv[1] === 'run' && /^(dev|start|serve)$/.test(String(argv[2] || ''))) return 'service_control';
  if (SERVICE_COMMANDS.has(head)) return 'service_control';
  if (DB_COMMANDS.has(head)) return 'db_write';
  if (PACKAGE_MANAGERS.has(head) && isPackageOperation(head, argv[1])) return 'package_install';
  return null;
}

function isPackageOperation(manager: string, op: unknown) {
  const normalized = String(op || (manager === 'pip' || manager === 'pip3' ? 'install' : 'install')).toLowerCase();
  return PACKAGE_OPS[manager]?.has(normalized) === true;
}

function extractPathTokens(argv: string[], command: string) {
  const tokens = new Set<string>();
  for (const arg of argv) if (looksLikePath(arg)) tokens.add(arg);
  const raw = String(command || '').match(/(?:file:\/\/|~\/|\.{1,2}\/|\/)[^\s"'`|;&<>]+|[A-Za-z0-9_.-]+\/[A-Za-z0-9_./:-]+/g) || [];
  for (const token of raw) if (looksLikePath(token)) tokens.add(token);
  return [...tokens].slice(0, 80);
}

function normalizePathToken(token: string, opts: { cwd: string; targetRoot: string }) {
  const clean = stripFileUrl(String(token || '').replace(/^['"]|['"]$/g, ''));
  if (!clean || /^https?:\/\//i.test(clean)) return null;
  if (clean.startsWith('~/')) return path.resolve(process.env.HOME || opts.cwd, clean.slice(2));
  if (path.isAbsolute(clean)) return path.resolve(clean);
  return path.resolve(opts.cwd || opts.targetRoot, clean);
}

function stripFileUrl(token: string) {
  return token.startsWith('file://') ? token.slice('file://'.length) : token;
}

function looksLikePath(value: string) {
  const text = String(value || '');
  if (!text || isEnvAssignment(text)) return false;
  return text.startsWith('/')
    || text.startsWith('./')
    || text.startsWith('../')
    || text.startsWith('~/')
    || text.startsWith('file://')
    || /[A-Za-z0-9_.-]+\/[A-Za-z0-9_./:-]+/.test(text);
}

function hasGlobSyntax(value: string) {
  const text = String(value || '');
  return /(^|[^\\])[*?[]/.test(text);
}

function isEnvAssignment(value: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(String(value || ''));
}

function basename(value: string) {
  return path.basename(String(value || ''));
}

function hasAny(argv: string[], flags: string[]) {
  return argv.some((arg) => flags.includes(arg) || flags.some((flag) => arg.startsWith(flag)));
}

function isInside(candidate: string, root: string) {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
