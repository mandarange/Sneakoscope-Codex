import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { nowIso, writeJsonAtomic } from '../fsx.js';
import { runSuperSearch } from './index.js';

export interface SuperSearchLocalHttpSmokeReport {
  schema: 'sks.super-search-local-http-smoke.v1';
  ok: boolean;
  generated_at: string;
  url: string | null;
  fetch_ok: boolean;
  verified_content: boolean;
  content_artifact: string | null;
  content_sha256: string | null;
  content_length: number;
  source_backed_claim: boolean;
  server_closed: boolean;
  blockers: string[];
  warnings: string[];
}

export async function runSuperSearchLocalHttpSmoke(input: { root?: string; reportPath?: string } = {}): Promise<SuperSearchLocalHttpSmokeReport> {
  const root = input.root || process.cwd();
  const reportPath = input.reportPath || path.join(root, '.sneakoscope', 'reports', 'super-search-local-http-smoke.json');
  const body = 'Sneakoscope Super-Search local HTTP smoke content\n';
  let serverClosed = false;
  let url: string | null = null;
  const server = http.createServer((req, res) => {
    if (req.url === '/docs') {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(body);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('not found');
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('local smoke server did not expose a TCP port');
    url = `http://127.0.0.1:${address.port}/docs`;
    const missionDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-super-search-local-smoke-'));
    const result = await runSuperSearch({
      root,
      missionDir,
      query: url,
      mode: 'url_acquisition',
      allowLocalFetch: true,
      env: {}
    });
    const source = result.sources.find((entry) => entry.acquisition_verdict === 'verified_content') || result.sources[0] || null;
    const report: SuperSearchLocalHttpSmokeReport = {
      schema: 'sks.super-search-local-http-smoke.v1',
      ok: result.ok === true && source?.acquisition_verdict === 'verified_content' && Boolean(source.content_artifact) && Boolean(source.content_sha256) && Number(source.content_length || 0) > 0,
      generated_at: nowIso(),
      url,
      fetch_ok: result.ok === true,
      verified_content: source?.acquisition_verdict === 'verified_content',
      content_artifact: source?.content_artifact || null,
      content_sha256: source?.content_sha256 || null,
      content_length: Number(source?.content_length || 0),
      source_backed_claim: result.claims.some((claim) => (claim.status === 'supported' || claim.status === 'verified') && claim.source_ids.includes(source?.source_id || '')),
      server_closed: false,
      blockers: result.blockers || [],
      warnings: result.warnings || []
    };
    report.ok = report.ok && report.source_backed_claim;
    return await closeServerWithReport(server, reportPath, report, () => { serverClosed = true; });
  } catch (error) {
    const report: SuperSearchLocalHttpSmokeReport = {
      schema: 'sks.super-search-local-http-smoke.v1',
      ok: false,
      generated_at: nowIso(),
      url,
      fetch_ok: false,
      verified_content: false,
      content_artifact: null,
      content_sha256: null,
      content_length: 0,
      source_backed_claim: false,
      server_closed: serverClosed,
      blockers: [`local_http_smoke_failed:${error instanceof Error ? error.message : String(error)}`],
      warnings: []
    };
    return await closeServerWithReport(server, reportPath, report, () => { serverClosed = true; });
  }
}

async function closeServerWithReport(server: http.Server, reportPath: string, report: SuperSearchLocalHttpSmokeReport, onClosed: () => void): Promise<SuperSearchLocalHttpSmokeReport> {
  await new Promise<void>((resolve) => {
    if (!server.listening) {
      onClosed();
      resolve();
      return;
    }
    server.close(() => {
      onClosed();
      resolve();
    });
  });
  const finalReport = {
    ...report,
    server_closed: true,
    ok: report.ok && true
  };
  await writeJsonAtomic(reportPath, finalReport);
  return finalReport;
}
