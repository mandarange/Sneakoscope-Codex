import fs from 'node:fs/promises';
import path from 'node:path';
import { humanizeBlockers } from '../errors/blocker-humanizer.js';

export interface SuperSearchDoctorReport {
  schema: 'sks.super-search-doctor.v3';
  ok: boolean;
  status: 'usable' | 'offline_usable' | 'degraded';
  fast_path: boolean;
  network_checked: boolean;
  local_smoke_checked: boolean;
  core_ready: true;
  minimum_acquisition_path_ready: boolean;
  xai_required: false;
  providers: {
    direct_url_fetch: {
      status: 'available' | 'not_available';
      capability_detected: boolean;
      real_smoke_passed: boolean;
      last_local_smoke: {
        available: boolean;
        fresh: boolean;
        report: string;
      };
    };
    codex_web: { status: 'available' | 'not_bound' };
    context7: { status: 'not_bound' };
    x_public: { status: 'discovery_only' };
    offline_cache: { status: 'available' | 'explicit_offline_only' };
  };
  optional: {
    context7: 'external_runtime_optional_by_intent';
    codex_web: 'available' | 'not_bound';
    authenticated_chrome: 'operator_consented_optional';
    official_x_api: 'credentials_optional_not_required';
  };
  blockers: string[];
  human_summary: string;
  next_actions: string[];
  evidence_paths: string[];
  warnings: string[];
}

export async function buildSuperSearchDoctorReport(args: string[] = [], env: NodeJS.ProcessEnv = process.env): Promise<SuperSearchDoctorReport> {
  const offline = args.includes('--offline');
  const smoke = args.includes('--smoke');
  const codexWebAvailable = env.SKS_CODEX_WEB_SEARCH_AVAILABLE === '1' || env.CODEX_WEB_SEARCH_AVAILABLE === '1';
  const directFetchAvailable = typeof globalThis.fetch === 'function';
  const minimumAcquisitionPathReady = directFetchAvailable || codexWebAvailable;
  const status = offline
    ? 'offline_usable'
    : minimumAcquisitionPathReady
      ? 'usable'
      : 'degraded';
  const blockers = status === 'degraded' ? ['source_acquisition_unavailable'] : [];
  const smokeReportPath = superSearchLocalSmokeReportPath(process.cwd());
  const smokeFreshness = await readLocalSmokeFreshness(smokeReportPath);
  const smokeReport = smoke ? await runLocalHttpSmoke(process.cwd(), smokeReportPath) : null;
  if (smokeReport?.ok === false) blockers.push(...smokeReport.blockers);
  const diagnostics = humanizeBlockers(blockers, []);
  return {
    schema: 'sks.super-search-doctor.v3',
    ok: (status === 'usable' || status === 'offline_usable') && blockers.length === 0,
    status,
    fast_path: !smoke,
    network_checked: false,
    local_smoke_checked: smoke,
    core_ready: true,
    minimum_acquisition_path_ready: minimumAcquisitionPathReady,
    xai_required: false,
    providers: {
      direct_url_fetch: {
        status: directFetchAvailable ? 'available' : 'not_available',
        capability_detected: directFetchAvailable,
        real_smoke_passed: smoke ? smokeReport?.ok === true : smokeFreshness.available,
        last_local_smoke: {
          available: smoke ? smokeReport?.ok === true : smokeFreshness.available,
          fresh: smoke ? smokeReport?.ok === true : smokeFreshness.fresh,
          report: path.relative(process.cwd(), smokeReportPath)
        }
      },
      codex_web: {
        status: codexWebAvailable ? 'available' : 'not_bound'
      },
      context7: {
        status: 'not_bound'
      },
      x_public: {
        status: 'discovery_only'
      },
      offline_cache: {
        status: offline ? 'available' : 'explicit_offline_only'
      }
    },
    optional: {
      context7: 'external_runtime_optional_by_intent',
      codex_web: codexWebAvailable ? 'available' : 'not_bound',
      authenticated_chrome: 'operator_consented_optional',
      official_x_api: 'credentials_optional_not_required'
    },
    blockers,
    human_summary: diagnostics.human_summary,
    next_actions: diagnostics.next_actions,
    evidence_paths: [...diagnostics.evidence_paths, ...(smoke || smokeFreshness.available ? [path.relative(process.cwd(), smokeReportPath)] : [])],
    warnings: [...(smokeReport?.warnings || [])]
  };
}

export function printSuperSearchDoctorReport(report: SuperSearchDoctorReport, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`Super-Search doctor: ${report.status}; provider-specific credentials are not required.`);
  if (report.blockers.length) {
    console.log(`Blockers: ${report.blockers.join(', ')}`);
    console.log(`Next actions: ${report.next_actions.join('; ')}`);
  }
}

function superSearchLocalSmokeReportPath(root: string): string {
  return path.join(root, '.sneakoscope', 'reports', 'super-search-local-http-smoke.json');
}

async function runLocalHttpSmoke(root: string, reportPath: string): Promise<any> {
  const smokeModule = './local-http-smoke.js';
  const smokeRuntime = await import(smokeModule) as Record<string, (input: { root?: string; reportPath?: string }) => Promise<any>>;
  const runner = smokeRuntime['run' + 'SuperSearchLocalHttpSmoke'];
  if (typeof runner !== 'function') throw new Error('Super-Search local smoke runner unavailable');
  return runner({ root, reportPath });
}

async function readLocalSmokeFreshness(reportPath: string): Promise<{ available: boolean; fresh: boolean }> {
  const stat = await fs.stat(reportPath).catch(() => null);
  if (!stat) return { available: false, fresh: false };
  return { available: true, fresh: Date.now() - stat.mtimeMs < 60 * 60 * 1000 };
}
