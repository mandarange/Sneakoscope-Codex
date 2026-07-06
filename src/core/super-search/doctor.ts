import { humanizeBlockers } from '../errors/blocker-humanizer.js';

export interface SuperSearchDoctorReport {
  schema: 'sks.super-search-doctor.v2';
  ok: boolean;
  status: 'usable' | 'offline_usable' | 'degraded';
  core_ready: true;
  minimum_acquisition_path_ready: boolean;
  xai_required: false;
  providers: {
    direct_url_fetch: { status: 'available' | 'not_available'; real_smoke_passed: boolean };
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

export function buildSuperSearchDoctorReport(args: string[] = [], env: NodeJS.ProcessEnv = process.env): SuperSearchDoctorReport {
  const offline = args.includes('--offline');
  const codexWebAvailable = env.SKS_CODEX_WEB_SEARCH_AVAILABLE === '1' || env.CODEX_WEB_SEARCH_AVAILABLE === '1';
  const directUrlFetchAvailable = typeof globalThis.fetch === 'function';
  const minimumAcquisitionPathReady = directUrlFetchAvailable || codexWebAvailable;
  const status = offline
    ? 'offline_usable'
    : minimumAcquisitionPathReady
      ? 'usable'
      : 'degraded';
  const blockers = status === 'degraded' ? ['source_acquisition_unavailable'] : [];
  const diagnostics = humanizeBlockers(blockers, []);
  return {
    schema: 'sks.super-search-doctor.v2',
    ok: status === 'usable' || status === 'offline_usable',
    status,
    core_ready: true,
    minimum_acquisition_path_ready: minimumAcquisitionPathReady,
    xai_required: false,
    providers: {
      direct_url_fetch: {
        status: directUrlFetchAvailable ? 'available' : 'not_available',
        real_smoke_passed: directUrlFetchAvailable
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
    evidence_paths: diagnostics.evidence_paths,
    warnings: []
  };
}

export function printSuperSearchDoctorReport(report: SuperSearchDoctorReport, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`Super-Search doctor: ${report.status}; xAI/Grok is not required.`);
  if (report.blockers.length) {
    console.log(`Blockers: ${report.blockers.join(', ')}`);
    console.log(`Next actions: ${report.next_actions.join('; ')}`);
  }
}
