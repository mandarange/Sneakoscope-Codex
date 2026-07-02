import { madHighCommand } from './mad-sks-command.js';

export async function madDbCommand(args: string[] = []) {
  const translated = translateMadDbArgs(args);
  const json = args.includes('--json');
  process.stderr.write("mad-db is deprecated; use 'sks mad-sks sql ...' or 'sks mad-sks apply-migration ...'.\n");
  if (!json) return madHighCommand(['--mad-sks', ...translated]);

  const originalLog = console.log;
  const chunks: string[] = [];
  console.log = (...values: unknown[]) => {
    chunks.push(values.map((value) => typeof value === 'string' ? value : JSON.stringify(value)).join(' '));
  };
  try {
    const result = await madHighCommand(['--mad-sks', ...translated]);
    const parsed = parseCapturedJson(chunks.join('\n'));
    const output = {
      ...(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : result && typeof result === 'object' ? result : {}),
      deprecated_alias: 'mad-db'
    };
    originalLog(JSON.stringify(output, null, 2));
    return output;
  } finally {
    console.log = originalLog;
  }
}

function translateMadDbArgs(args: string[] = []) {
  const list = args.map(String);
  const action = list[0] && !list[0].startsWith('--') ? list[0] : 'status';
  const rest = action === list[0] ? list.slice(1) : list;
  if (action === 'run' || action === 'exec') {
    const sql = readOption(rest, '--sql', '') || positionalText(rest);
    return ['sql', ...(sql ? [sql] : []), ...preservedOptions(rest)];
  }
  if (action === 'apply-migration') {
    const file = readOption(rest, '--file', '') || positionalText(rest);
    return ['apply-migration', ...(file ? [file] : []), ...preservedOptions(rest, new Set(['--file']))];
  }
  if (action === 'doctor') return ['status', ...rest];
  if (['status', 'close', 'revoke'].includes(action)) return [action, ...rest];
  if (action === 'enable') return ['permissions', ...rest];
  return [action, ...rest];
}

function preservedOptions(args: string[] = [], omit = new Set<string>()) {
  const valueFlags = new Set(['--verify-sql', '--rollback-sql', '--ttl', '--target-root', '--intent', '--name', '--file']);
  const out: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = String(args[index] || '');
    if (!arg.startsWith('--')) continue;
    if (omit.has(arg)) {
      if (valueFlags.has(arg) && args[index + 1] && !String(args[index + 1]).startsWith('--')) index += 1;
      continue;
    }
    out.push(arg);
    if (valueFlags.has(arg) && args[index + 1] && !String(args[index + 1]).startsWith('--')) {
      out.push(String(args[index + 1]));
      index += 1;
    }
  }
  return out;
}

function readOption(args: string[], name: string, fallback: string) {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !String(args[index + 1]).startsWith('--')) return String(args[index + 1]);
  const prefixed = args.find((arg) => String(arg).startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : fallback;
}

function positionalText(args: string[] = []) {
  const valueFlags = new Set(['--sql', '--verify-sql', '--rollback-sql', '--ttl', '--target-root', '--intent', '--name', '--file']);
  const out: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = String(args[index] || '');
    if (!arg || arg === '--json' || arg === '--yes' || arg === '-y') continue;
    if (valueFlags.has(arg)) {
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) continue;
    out.push(arg);
  }
  return out.join(' ').trim();
}

function parseCapturedJson(text: string) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {}
    }
  }
  return null;
}
