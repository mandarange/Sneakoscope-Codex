/**
 * Upsert `[hooks.state."<key>"]` trust tables into a Codex config.toml. Codex
 * reads these only from the user config (`$CODEX_HOME/config.toml`); see
 * codex-global-hooks.ts for the one writer.
 */
export function upsertTrustBlocks(existing: string, blocks: Array<{ key: string; block: string }>): string {
  let next = String(existing || '').trimEnd();
  for (const block of blocks) {
    next = upsertTomlTable(next, `hooks.state."${tomlQuotedKey(block.key)}"`, block.block);
  }
  return `${next.trim()}\n`;
}

function upsertTomlTable(text: string, table: string, block: string): string {
  let lines = String(text || '').trimEnd().split('\n');
  if (lines.length === 1 && lines[0] === '') lines = [];
  const header = `[${table}]`;
  const start = lines.findIndex((line) => line.trim() === header);
  const blockLines = String(block || '').trim().split('\n');
  if (start === -1) return [...lines, ...(lines.length ? [''] : []), ...blockLines].join('\n').replace(/\n{3,}/g, '\n\n');
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s*\[.+\]\s*$/.test(lines[i] || '')) {
      end = i;
      break;
    }
  }
  // Keep the blank separator that precedes the next header: it lives inside
  // [start, end) and was being swallowed, so this writer and
  // splitCodexProjectConfigPolicy (which re-adds it) rewrote the managed hook
  // tables against each other forever.
  while (end > start + 1 && !String(lines[end - 1] || '').trim()) end -= 1;
  lines.splice(start, end - start, ...blockLines);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function tomlQuotedKey(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
