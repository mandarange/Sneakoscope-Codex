/** Content-free measurements for a refused native compact request, never a trim policy. */
const GROUPS = [
  'system_message', 'developer_message', 'user_message', 'assistant_message',
  'additional_tools', 'state_tool_call', 'function_call', 'function_call_output',
  'custom_tool_call', 'custom_tool_call_output', 'apply_patch_call', 'apply_patch_call_output',
  'compaction', 'compaction_summary', 'context_compaction', 'reasoning', 'compaction_trigger', 'other'
] as const;
type Group = typeof GROUPS[number];
const STATE_TOOLS = new Set(['create_goal', 'get_goal', 'update_goal', 'update_plan']);

interface GroupSize {
  items: number;
  ascii_json_chars_estimate: number;
  largest_item_ascii_json_chars_estimate: number;
}

export interface CompactionInputSizes {
  schema: 'sks.compaction-input-sizes.v1';
  input_items: number;
  input_json_bytes: number;
  input_ascii_json_chars_estimate: number;
  input_estimated_tokens: number;
  instructions_ascii_json_chars_estimate: number;
  groups: Partial<Record<Group, GroupSize>>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function groupFor(value: unknown): Group {
  const item = record(value);
  if (!item) return 'other';
  if (item.type === undefined || item.type === 'message') {
    const role = item.role;
    return role === 'system' || role === 'developer' || role === 'user' || role === 'assistant' ? `${role}_message` : 'other';
  }
  const name = item.name ?? record(item.function)?.name;
  if (item.type === 'function_call' && typeof name === 'string' && STATE_TOOLS.has(name)) return 'state_tool_call';
  return GROUPS.includes(item.type as Group) && !String(item.type).endsWith('_message') && item.type !== 'state_tool_call'
    ? item.type as Group : 'other';
}

/**
 * Python json.dumps defaults escape non-ASCII UTF-16 units and put spaces after
 * separators. Match those costs instead of treating UTF-8 bytes as tokens.
 * Numeric formatting can differ between Python and JS; this remains diagnostic
 * evidence, not an upstream budget validator or a tokenizer.
 */
function sizes(value: unknown): { bytes: number; ascii: number } {
  const json = JSON.stringify(value) ?? 'null';
  let ascii = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < json.length; index += 1) {
    const char = json[index]!;
    if (quoted) {
      ascii += json.charCodeAt(index) >= 127 ? 6 : 1;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else {
      ascii += char === ',' || char === ':' ? 2 : 1;
      if (char === '"') quoted = true;
    }
  }
  return { bytes: Buffer.byteLength(json), ascii };
}

export function compactionInputSizes(payload: Record<string, unknown>): CompactionInputSizes | null {
  if (!Array.isArray(payload.input)) return null;
  try {
    const groups: CompactionInputSizes['groups'] = {};
    let bytes = 2;
    let ascii = 2;
    for (const [index, item] of payload.input.entries()) {
      const size = sizes(item);
      bytes += size.bytes + Number(index > 0);
      ascii += size.ascii + (index > 0 ? 2 : 0);
      const group = groups[groupFor(item)] ??= { items: 0, ascii_json_chars_estimate: 0, largest_item_ascii_json_chars_estimate: 0 };
      group.items += 1;
      group.ascii_json_chars_estimate += size.ascii;
      group.largest_item_ascii_json_chars_estimate = Math.max(group.largest_item_ascii_json_chars_estimate, size.ascii);
    }
    return {
      schema: 'sks.compaction-input-sizes.v1', input_items: payload.input.length,
      input_json_bytes: bytes, input_ascii_json_chars_estimate: ascii,
      input_estimated_tokens: Math.ceil(ascii / 4),
      instructions_ascii_json_chars_estimate: typeof payload.instructions === 'string' ? sizes(payload.instructions).ascii : 0,
      groups
    };
  } catch { return null; }
}

/** Rebuild logged measurements from fixed labels and nonnegative integers only. */
export function safeCompactionInputSizes(value: unknown): CompactionInputSizes | null {
  const raw = record(value);
  if (raw?.schema !== 'sks.compaction-input-sizes.v1') return null;
  const count = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
  const fields = ['input_items', 'input_json_bytes', 'input_ascii_json_chars_estimate', 'input_estimated_tokens', 'instructions_ascii_json_chars_estimate'] as const;
  if (fields.some(field => count(raw[field]) === null)) return null;
  const groups: CompactionInputSizes['groups'] = {};
  const source = record(raw.groups);
  for (const name of GROUPS) {
    const group = record(source?.[name]);
    if (!group) continue;
    const items = count(group.items);
    const ascii = count(group.ascii_json_chars_estimate);
    const largest = count(group.largest_item_ascii_json_chars_estimate);
    if (items !== null && ascii !== null && largest !== null) {
      groups[name] = { items, ascii_json_chars_estimate: ascii, largest_item_ascii_json_chars_estimate: largest };
    }
  }
  return {
    schema: 'sks.compaction-input-sizes.v1',
    input_items: raw.input_items as number, input_json_bytes: raw.input_json_bytes as number,
    input_ascii_json_chars_estimate: raw.input_ascii_json_chars_estimate as number,
    input_estimated_tokens: raw.input_estimated_tokens as number,
    instructions_ascii_json_chars_estimate: raw.instructions_ascii_json_chars_estimate as number, groups
  };
}
