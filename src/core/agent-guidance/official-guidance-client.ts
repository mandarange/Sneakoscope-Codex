import { createHash } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { PACKAGE_VERSION } from '../version.js';

export const OFFICIAL_GUIDANCE_SOURCES = [
  { id: 'codex-instructions', query: 'Codex AGENTS.md concise instructions', url: 'https://learn.chatgpt.com/docs/agent-configuration/agents-md', paths: ['/docs/agent-configuration/agents-md', '/codex/guides/agents-md'] },
  { id: 'codex-prompting', query: 'Codex prompting goals context boundaries', url: 'https://learn.chatgpt.com/docs/prompting', paths: ['/docs/prompting', '/codex/prompting'] },
  { id: 'latest-model-guidance', query: 'latest model prompting best practices', url: 'https://developers.openai.com/api/docs/guides/latest-model', paths: ['/api/docs/guides/latest-model', '/docs/guides/latest-model'] }
] as const;

export interface OfficialGuidanceSource {
  id: string;
  query: string;
  url: string;
  title: string;
  discovered_via_search: boolean;
  search_result_urls: string[];
  text: string;
  sha256: string;
}

export interface OfficialGuidanceSnapshot {
  schema: 'sks.official-guidance.v1';
  fetched_at: string;
  sources: OfficialGuidanceSource[];
}

const OFFICIAL_HOSTS = new Set(['developers.openai.com', 'learn.chatgpt.com', 'platform.openai.com']);
const MAX_RESPONSE_BYTES = 1024 * 1024;

/** Public documentation only: no account configuration, credentials, or model turn. */
export async function retrieveOfficialGuidance(): Promise<OfficialGuidanceSnapshot> {
  const client = new Client({ name: 'sneakoscope-official-guidance', version: PACKAGE_VERSION }, {
    versionNegotiation: { mode: 'auto', probe: { timeoutMs: 6000, maxRetries: 0 } },
    inputRequired: { autoFulfill: false }
  });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL('https://developers.openai.com/mcp')), { timeout: 6000 });
    const selected = await Promise.all(OFFICIAL_GUIDANCE_SOURCES.map(async source => {
      const search = await client.callTool({ name: 'search_openai_docs', arguments: { query: source.query, limit: 5 } }, { timeout: 6000 });
      const result = JSON.parse(toolText(search));
      if (!Array.isArray(result.hits)) throw new Error(`official_guidance_search_invalid:${source.id}`);
      const hit = result.hits.find((row: any) => sourceUrlAllowed(source.id, row?.url));
      // Search ranking may omit a known official page. Fetch that canonical
      // reference directly and record that it was not discovered in these hits.
      const url = new URL(hit?.url || source.url);
      url.hash = ''; url.search = '';
      return {
        source, url: url.toString(), discovered_via_search: Boolean(hit),
        search_result_urls: result.hits.slice(0,5).map((row: any) => String(row?.url || '').slice(0,2048))
      };
    }));
    const sources = await Promise.all(selected.map(async ({ source, url, discovered_via_search, search_result_urls }) => {
      const fetched = await client.callTool({ name: 'fetch_openai_doc', arguments: { url } }, { timeout: 6000 });
      const text = toolText(fetched);
      if (text.length < 100 || Buffer.byteLength(text) > 256 * 1024) throw new Error(`official_guidance_document_invalid:${source.id}`);
      const title = (text.match(/^#\s+(.+)$/m)?.[1] || source.id).replace(/[\r\n`]/g, ' ').slice(0,160);
      return { id: source.id, query: source.query, url, title, discovered_via_search, search_result_urls, text, sha256: digest(text) };
    }));
    return { schema: 'sks.official-guidance.v1', fetched_at: new Date().toISOString(), sources };
  } finally { await client.close(); }
}

export function validOfficialGuidance(value: unknown): value is OfficialGuidanceSnapshot {
  const row = value as OfficialGuidanceSnapshot;
  return row?.schema === 'sks.official-guidance.v1'
    && Number.isFinite(Date.parse(row.fetched_at))
    && Array.isArray(row.sources) && row.sources.length === OFFICIAL_GUIDANCE_SOURCES.length
    && OFFICIAL_GUIDANCE_SOURCES.every(expected => row.sources.filter(source => source.id === expected.id).length === 1)
    && row.sources.every(source => sourceUrlAllowed(source.id, source.url)
      && typeof source.discovered_via_search === 'boolean'
      && Array.isArray(source.search_result_urls) && source.search_result_urls.length <= 5
      && typeof source.text === 'string' && source.text.length >= 100
      && Buffer.byteLength(source.text) <= 256 * 1024
      && source.sha256 === digest(source.text));
}

function sourceUrlAllowed(id: string, value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    const source = OFFICIAL_GUIDANCE_SOURCES.find(row => row.id === id);
    const pathname = url.pathname.replace(/\/$/, '');
    return url.protocol === 'https:' && OFFICIAL_HOSTS.has(url.hostname) && !url.port && !url.username && !url.password
      && Boolean(source?.paths.some(path => pathname === path));
  } catch { return false; }
}

function toolText(result: unknown): string {
  const row = result as { isError?: boolean; content?: Array<{ type?: string; text?: string }> };
  if (row?.isError || !Array.isArray(row?.content)) throw new Error('official_guidance_tool_failed');
  const text = row.content.filter(item => item.type === 'text' && typeof item.text === 'string').map(item => item.text).join('\n');
  if (!text || Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new Error('official_guidance_response_invalid');
  return text;
}

function digest(text: string): string { return createHash('sha256').update(text).digest('hex'); }
