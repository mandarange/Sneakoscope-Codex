const SECRET_ENV_NAMES = [
  'CODEX_ACCESS_TOKEN',
  'OPENAI_API_KEY',
  'CODEX_LB_API_KEY',
  'ANTHROPIC_API_KEY',
  'GITHUB_TOKEN',
  'GITHUB_PAT'
];

const SECRET_PATTERNS = [
  /\bsk-proj-[A-Za-z0-9_-]{12,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-clb-[A-Za-z0-9_-]{8,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bghp_[A-Za-z0-9_]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/gi,
  /\b(?:access[_-]?token|api[_-]?key|secret|password|token)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{12,}["']?/gi
];

export const REDACTION_MARKER = '[redacted]';

export function redactSecrets(value, env = process.env) {
  if (value == null) return value;
  if (typeof value === 'string') return redactString(value, env);
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, env));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, candidate] of Object.entries(value)) {
      out[key] = secretKeyName(key) ? REDACTION_MARKER : redactSecrets(candidate, env);
    }
    return out;
  }
  return value;
}

export function redactString(input = '', env = process.env) {
  let out = String(input);
  for (const name of SECRET_ENV_NAMES) {
    const raw = env?.[name];
    if (raw && raw.length >= 4) out = out.split(raw).join(REDACTION_MARKER);
    out = out.replace(new RegExp(`(${name}\\s*[:=]\\s*)[^\\s"',}]+`, 'gi'), `$1${REDACTION_MARKER}`);
  }
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, (match) => redactKeyValue(match));
  return out;
}

export function containsPlaintextSecret(value, env = process.env) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || {});
  for (const name of SECRET_ENV_NAMES) {
    const raw = env?.[name];
    if (raw && raw.length >= 4 && text.includes(raw)) return true;
  }
  return SECRET_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

function secretKeyName(key = '') {
  return /(?:access[_-]?token|api[_-]?key|secret|password|token)$/i.test(String(key || ''))
    || SECRET_ENV_NAMES.includes(String(key || '').toUpperCase());
}

function redactKeyValue(match) {
  const keyValue = String(match).match(/^([^:=]+[:=]\s*)/);
  if (keyValue) return `${keyValue[1]}${REDACTION_MARKER}`;
  if (/^Bearer\s+/i.test(match)) return `Bearer ${REDACTION_MARKER}`;
  return REDACTION_MARKER;
}
