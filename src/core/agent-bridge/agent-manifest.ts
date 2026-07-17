import { COMMANDS, type CommandEntry, type CommandName } from '../../cli/command-registry.js';
import { nowIso } from '../fsx.js';
import {
  NARUTO_ACTIONS,
  commandContract,
  validateCommandContractRegistry,
  type CommandRisk
} from '../safety/command-contract/index.js';

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
  contract_schema: 'sks.command-contract.v2';
  risk: CommandRisk;
  remote_allowed: boolean;
  telegram_allowed: boolean;
  input_schema: Record<string, unknown>;
  required_capabilities: string[];
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

function exampleInvocation(name: string, jsonSupported: boolean): string {
  if (name === 'naruto') return 'sks naruto help --json';
  return jsonSupported ? `sks ${name} --json` : `sks ${name}`;
}

function buildEntry(name: CommandName, command: CommandEntry): AgentManifestEntry {
  const contract = commandContract(name);
  if (!contract) throw new Error(`Missing command contract for ${name}`);
  return {
    name,
    description: command.summary,
    read_only: contract.read_only,
    requires_explicit_opt_in: contract.risk === 'R2' || contract.risk === 'R3',
    json_output_supported: contract.supports_json,
    latency_class: contract.latency,
    example_invocation: exampleInvocation(name, contract.supports_json),
    maturity: command.maturity,
    contract_schema: contract.schema,
    risk: contract.risk,
    remote_allowed: contract.remote_allowed,
    telegram_allowed: contract.telegram_allowed,
    input_schema: contract.input_schema,
    required_capabilities: [...contract.required_capabilities]
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
  const contractValidation = validateCommandContractRegistry();

  if (candidate?.schema !== 'sks.agent-manifest.v1') issues.push('schema');
  if (!contractValidation.ok) issues.push(...contractValidation.issues.map((entry) => `command_contract:${entry}`));
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
    if ((tool as any)?.contract_schema !== 'sks.command-contract.v2') issues.push(`invalid_contract_schema:${name || '<missing>'}`);
    if (!['R0', 'R1', 'R2', 'R3'].includes(String((tool as any)?.risk || ''))) issues.push(`invalid_risk:${name || '<missing>'}`);
    if (typeof (tool as any)?.remote_allowed !== 'boolean') issues.push(`invalid_remote_allowed:${name || '<missing>'}`);
    if (typeof (tool as any)?.telegram_allowed !== 'boolean') issues.push(`invalid_telegram_allowed:${name || '<missing>'}`);
    if (!(tool as any)?.input_schema || typeof (tool as any).input_schema !== 'object') issues.push(`invalid_input_schema:${name || '<missing>'}`);
  }

  const naruto = tools.find((tool: any) => tool?.name === 'naruto') as any;
  const expectedNaruto = commandContract('naruto');
  const narutoActions = naruto?.input_schema?.properties?.action?.enum;
  if (JSON.stringify(narutoActions) !== JSON.stringify(NARUTO_ACTIONS)) issues.push('naruto_action_contract_mismatch');
  if (naruto?.risk !== expectedNaruto?.risk || naruto?.risk !== 'R2') issues.push('contract_risk_mismatch:naruto');
  if (naruto?.latency_class !== expectedNaruto?.latency || naruto?.latency_class !== 'long') issues.push('contract_latency_mismatch:naruto');
  if (naruto?.json_output_supported !== expectedNaruto?.supports_json || naruto?.json_output_supported !== true) issues.push('contract_json_mismatch:naruto');
  if (naruto?.remote_allowed !== expectedNaruto?.remote_allowed || naruto?.remote_allowed !== false) issues.push('contract_remote_mismatch:naruto');
  if (naruto?.telegram_allowed !== expectedNaruto?.telegram_allowed || naruto?.telegram_allowed !== false) issues.push('contract_telegram_mismatch:naruto');
  if (naruto?.requires_explicit_opt_in !== true) issues.push('contract_opt_in_mismatch:naruto');
  if (JSON.stringify(naruto?.input_schema) !== JSON.stringify(expectedNaruto?.input_schema)) issues.push('contract_input_schema_mismatch:naruto');

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
