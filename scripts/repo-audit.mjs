#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const riskyPathPatterns = [
  /(^|\/)\.env(\..*)?$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)\.pypirc$/,
  /(^|\/)\.netrc$/,
  /(^|\/)\.envrc$/,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/,
  /(^|\/)(\.mcp\.json|mcp\.json|claude_desktop_config\.json)$/,
  /(^|\/)(\.codex|\.agents|\.sneakoscope|\.dcodex|\.omx|\.cursor|\.windsurf)(\/|$)/,
  /(^|\/)(\.aws|\.azure)(\/|$)/,
  /\.(pem|key|p12|pfx|crt|cer|asc|kubeconfig|db|sqlite|sqlite3|dump|bak|backup|sql\.gz)$/i
];

const secretContentPatterns = [
  /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
  /\bnpm_[A-Za-z0-9]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/,
  /\bsk-[A-Za-z0-9_-]{32,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bservice_role\b.{0,80}\beyJ[A-Za-z0-9_-]{20,}/i,
  /\b(supabase|firebase|stripe|resend|vercel|github|openai)[A-Za-z0-9_-]{0,30}_(?:secret|token|key)\b\s*[:=]\s*['"]?[A-Za-z0-9._-]{20,}/i
];

function gitFiles(args) {
  const out = execFileSync('git', args, { encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}

function candidateFiles() {
  return [
    ...gitFiles(['ls-files', '-z']),
    ...gitFiles(['ls-files', '--others', '--exclude-standard', '-z'])
  ];
}

function isProbablyBinary(buf) {
  return buf.includes(0);
}

const files = [...new Set(candidateFiles())];
const findings = [];

for (const file of files) {
  for (const pattern of riskyPathPatterns) {
    if (pattern.test(file)) findings.push({ file, reason: 'risky tracked path' });
  }

  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch {
    continue;
  }
  if (isProbablyBinary(buf)) continue;
  const text = buf.toString('utf8');
  for (const pattern of secretContentPatterns) {
    if (pattern.test(text)) findings.push({ file, reason: 'possible secret material' });
  }
}

if (findings.length) {
  console.error('Repo audit failed. Remove or untrack these before publishing:');
  for (const f of findings) console.error(`- ${f.file}: ${f.reason}`);
  process.exit(1);
}

console.log(`Repo audit passed: ${files.length} tracked and unignored files checked.`);
