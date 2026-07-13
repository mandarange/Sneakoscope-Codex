import fs from 'node:fs';
import path from 'node:path';
import { COMMANDS, type CommandEntry, type CommandName } from '../../cli/command-registry.js';
import { nowIso, packageRoot } from '../fsx.js';

export type LatencyClass = 'fast' | 'normal' | 'long';

export interface AgentManifestEntry {
  name: string;
  description: string;
  read_only: boolean;
  requires_explicit_opt_in: boolean;
  json_output_supported: boolean;
  latency_class: LatencyClass;
  example_invocation: string;
  maturity: CommandEntry['maturity'];
}

export interface AgentManifest {
  schema: 'sks.agent-manifest.v1';
  generated_at: string;
  tools: AgentManifestEntry[];
}

export interface AgentManifestValidation {
  ok: boolean;
  issues: string[];
  expected_names: string[];
  observed_names: string[];
  missing_names: string[];
  unexpected_names: string[];
  duplicate_names: string[];
}

/** Keyword match on name+summary only, word-bounded to avoid substrings like "preset" matching "reset"; never invent commands not present in COMMANDS. */
const DESTRUCTIVE_NAME_PATTERNS = [/uninstall/, /^mad-sks$/, /^mad-db$/, /\breset\b/, /\bpurge\b/, /\bwipe\b/, /\bdelete\b/];
const DESTRUCTIVE_SUMMARY_PATTERNS = [/uninstall/i, /irreversib/i, /destructive/i, /\bdeletes?\b/i, /\bwipe[sd]?\b/i, /\bpurge[sd]?\b/i, /\breset[s]?\b/i];

const LONG_RUNNING_NAME_PATTERNS = [/^naruto$/, /^mad-sks$/, /^mad-db$/, /^update$/, /^update-check$/, /^postinstall$/, /^agent$/, /^team$/, /^loop$/, /^research$/, /^autoresearch$/];
const LONG_RUNNING_SUMMARY_PATTERNS = [/naruto/i, /shadow-clone swarm/i, /\bmad[- ]sks\b/i, /\bmad[- ]db\b/i, /\binstall\b/i, /\bupdate\b/i, /multi-session agent missions/i];

function isDestructive(name: string, summary: string): boolean {
  if (DESTRUCTIVE_NAME_PATTERNS.some((re) => re.test(name))) return true;
  return DESTRUCTIVE_SUMMARY_PATTERNS.some((re) => re.test(summary));
}

function isLongRunning(name: string, summary: string): boolean {
  if (LONG_RUNNING_NAME_PATTERNS.some((re) => re.test(name))) return true;
  return LONG_RUNNING_SUMMARY_PATTERNS.some((re) => re.test(summary));
}

/** Best-effort literal scan of the compiled command file; unreadable (e.g. packaged install without dist) means false, never a guessed true. */
function scanSupportsJsonFlag(packageRequiredFiles: readonly string[]): boolean {
  const root = packageRoot();
  for (const relFile of packageRequiredFiles) {
    try {
      const abs = path.join(root, relFile);
      if (!fs.existsSync(abs)) continue;
      const text = fs.readFileSync(abs, 'utf8');
      if (text.includes("'--json'") || text.includes('"--json"')) return true;
    } catch {
      continue;
    }
  }
  return false;
}

function exampleInvocation(name: string, jsonSupported: boolean): string {
  return jsonSupported ? `sks ${name} --json` : `sks ${name}`;
}

function buildEntry(name: CommandName, command: CommandEntry): AgentManifestEntry {
  const readOnly = command.readonly === true;
  const jsonSupported = scanSupportsJsonFlag(command.packageRequiredFiles);
  return {
    name,
    description: command.summary,
    read_only: readOnly,
    requires_explicit_opt_in: isDestructive(name, command.summary),
    json_output_supported: jsonSupported,
    latency_class: readOnly ? 'fast' : (isLongRunning(name, command.summary) ? 'long' : 'normal'),
    example_invocation: exampleInvocation(name, jsonSupported),
    maturity: command.maturity
  };
}

export function buildAgentManifest(): AgentManifest {
  const names = (Object.keys(COMMANDS) as CommandName[]).sort();
  const tools = names.map((name) => buildEntry(name, COMMANDS[name]));
  return {
    schema: 'sks.agent-manifest.v1',
    generated_at: nowIso(),
    tools
  };
}

export function validateAgentManifest(manifest: unknown): AgentManifestValidation {
  const candidate = manifest as Partial<AgentManifest> | null;
  const expectedNames = Object.keys(COMMANDS).sort();
  const tools = Array.isArray(candidate?.tools) ? candidate.tools : [];
  const observedNames = tools.map((tool: any) => String(tool?.name || '')).filter(Boolean);
  const observedSet = new Set(observedNames);
  const duplicateNames = [...new Set(observedNames.filter((name, index) => observedNames.indexOf(name) !== index))].sort();
  const missingNames = expectedNames.filter((name) => !observedSet.has(name));
  const unexpectedNames = [...observedSet].filter((name) => !(name in COMMANDS)).sort();
  const sortedNames = [...observedNames].sort();
  const issues: string[] = [];

  if (candidate?.schema !== 'sks.agent-manifest.v1') issues.push('schema');
  if (!Array.isArray(candidate?.tools)) issues.push('tools');
  if (duplicateNames.length) issues.push(...duplicateNames.map((name) => `duplicate_tool:${name}`));
  if (missingNames.length) issues.push(...missingNames.map((name) => `missing_registry_tool:${name}`));
  if (unexpectedNames.length) issues.push(...unexpectedNames.map((name) => `unexpected_tool:${name}`));
  if (JSON.stringify(observedNames) !== JSON.stringify(sortedNames)) issues.push('tool_order');

  for (const tool of tools) {
    const name = String((tool as any)?.name || '');
    if (!name || typeof (tool as any)?.description !== 'string') issues.push(`invalid_tool_shape:${name || '<missing>'}`);
    if (typeof (tool as any)?.read_only !== 'boolean') issues.push(`invalid_read_only:${name || '<missing>'}`);
    if (typeof (tool as any)?.requires_explicit_opt_in !== 'boolean') issues.push(`invalid_opt_in:${name || '<missing>'}`);
    if (typeof (tool as any)?.json_output_supported !== 'boolean') issues.push(`invalid_json_support:${name || '<missing>'}`);
    if (!['fast', 'normal', 'long'].includes(String((tool as any)?.latency_class || ''))) issues.push(`invalid_latency_class:${name || '<missing>'}`);
    if (typeof (tool as any)?.example_invocation !== 'string' || !(tool as any).example_invocation.startsWith(`sks ${name}`)) issues.push(`invalid_example:${name || '<missing>'}`);
  }

  return {
    ok: issues.length === 0,
    issues: [...new Set(issues)],
    expected_names: expectedNames,
    observed_names: observedNames,
    missing_names: missingNames,
    unexpected_names: unexpectedNames,
    duplicate_names: duplicateNames
  };
}
