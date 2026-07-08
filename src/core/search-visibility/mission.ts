import path from 'node:path';
import { createMission, findLatestMission, missionDir, setCurrent } from '../mission.js';
import { ensureDir, projectRoot, readJson, writeJsonAtomic, type JsonData } from '../fsx.js';
import type { SearchVisibilityCliOptions, SearchVisibilityMode, SearchVisibilityRoute } from './types.js';

export const SEARCH_VISIBILITY_DIR = 'search-visibility';

export interface SearchVisibilityMission {
  id: string;
  root: string;
  dir: string;
  artifactDir: string;
}

export async function createSearchVisibilityMission(
  mode: SearchVisibilityMode,
  prompt: string,
  options: SearchVisibilityCliOptions
): Promise<SearchVisibilityMission> {
  const root = await projectRoot(options.root);
  const { id, dir } = await createMission(root, { mode, prompt });
  const artifactDir = path.join(dir, SEARCH_VISIBILITY_DIR);
  await ensureDir(artifactDir);
  const route = routeForMode(mode);
  await setCurrent(root, {
    mission_id: id,
    mode: 'SEO_GEO_OPTIMIZER',
    route: 'SEO_GEO_OPTIMIZER',
    route_command: route,
    search_visibility_mode: mode,
    phase: `${mode.toUpperCase()}_PREPARED`,
    implementation_allowed: false,
  });
  await writeJsonAtomic(path.join(artifactDir, 'intake.json'), {
    schema: 'sks.search-visibility.intake.v1',
    generated_at: new Date().toISOString(),
    mission_id: id,
    route,
    root,
    target: options.target,
    url: options.url,
    framework: options.framework,
    authorization: {
      apply: options.apply,
      include_llms_txt: options.includeLlmsTxt,
      allow_dirty_touched: options.allowDirtyTouched,
      scope: options.scope,
    },
    network_used: false,
    browser_used: false,
    status: 'prepared',
    blockers: [],
    unverified: ['external production, browser, Search Console, and analytics outcomes are not verified by default'],
  });
  return { id, root, dir, artifactDir };
}

export async function resolveSearchVisibilityMission(rootInput: string, missionRef: string | null, mode?: SearchVisibilityMode): Promise<SearchVisibilityMission | null> {
  const root = await projectRoot(rootInput);
  const id = !missionRef || missionRef === 'latest' ? await findLatestMission(root, mode ? { mode } : {}) : missionRef;
  if (!id) return null;
  const dir = missionDir(root, id);
  const artifactDir = path.join(dir, SEARCH_VISIBILITY_DIR);
  return { id, root, dir, artifactDir };
}

export async function readSearchVisibilityState(mission: SearchVisibilityMission): Promise<JsonData> {
  return readJson(path.join(mission.artifactDir, 'intake.json'), {});
}

export function routeForMode(_mode: SearchVisibilityMode): SearchVisibilityRoute {
  return '$SEO-GEO-OPTIMIZER';
}

export function gateFileForMode(mode: SearchVisibilityMode): 'seo-gate.json' | 'geo-gate.json' {
  return mode === 'seo' ? 'seo-gate.json' : 'geo-gate.json';
}

export function findingsFileForMode(mode: SearchVisibilityMode): 'seo-findings.json' | 'geo-findings.json' {
  return mode === 'seo' ? 'seo-findings.json' : 'geo-findings.json';
}

export function missionRel(missionId: string, artifact: string): string {
  return `.sneakoscope/missions/${missionId}/${SEARCH_VISIBILITY_DIR}/${artifact}`;
}
