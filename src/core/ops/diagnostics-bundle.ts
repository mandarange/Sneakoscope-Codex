import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readJsonFile, nowIso, writeOpsReport, type OpsReport } from './reporting.js';

export interface OpsDiagnosticsBundle extends OpsReport {
  schema: 'sks.ops-diagnostics-bundle.v1';
  package_version: string | null;
  node_version: string;
  platform: string;
  active_root: string;
  command_manifest_hash: string | null;
  route_manifest_hash: string | null;
  latest_mission_summary: Record<string, unknown> | null;
  recent_blockers: string[];
  high_risk_contract_status: Record<string, unknown> | null;
  doctor: {
    fast: Record<string, unknown> | null;
    full: Record<string, unknown> | null;
  };
  retention_status: Record<string, unknown> | null;
  package_surface_summary: Record<string, unknown>;
  redacted_env_keys: string[];
  secret_scan: {
    raw_values_recorded: false;
    suspicious_key_count: number;
  };
}

export async function buildOpsDiagnosticsBundle(root: string): Promise<OpsDiagnosticsBundle> {
  const packageJson = await readJsonFile(path.join(root, 'package.json'));
  const commandManifestHash = await hashIfExists(path.join(root, 'dist', 'cli', 'command-manifest-lite.js'))
    ?? await hashIfExists(path.join(root, 'src', 'cli', 'command-manifest-lite.ts'));
  const routeManifestHash = await hashIfExists(path.join(root, 'dist', 'core', 'routes.js'))
    ?? await hashIfExists(path.join(root, 'src', 'core', 'routes.ts'));
  const latestMissionSummary = await latestMission(root);
  const doctorFast = await readJsonFile(path.join(root, '.sneakoscope', 'reports', 'doctor-fast.json'));
  const doctorFull = await readJsonFile(path.join(root, '.sneakoscope', 'reports', 'doctor-full.json'));
  const retentionStatus = await readJsonFile(path.join(root, '.sneakoscope', 'reports', 'retention-status.json'));
  const highRiskStatus = await readJsonFile(path.join(root, '.sneakoscope', 'reports', 'high-risk-contracts.json'));
  const recentBlockers = [
    ...blockersOf(latestMissionSummary),
    ...blockersOf(doctorFast),
    ...blockersOf(doctorFull),
    ...blockersOf(retentionStatus),
    ...blockersOf(highRiskStatus)
  ].slice(0, 25);
  return {
    schema: 'sks.ops-diagnostics-bundle.v1',
    ok: true,
    generated_at: nowIso(),
    blockers: [],
    package_version: typeof packageJson?.version === 'string' ? packageJson.version : null,
    node_version: process.version,
    platform: `${os.platform()}-${os.arch()}`,
    active_root: root,
    command_manifest_hash: commandManifestHash,
    route_manifest_hash: routeManifestHash,
    latest_mission_summary: latestMissionSummary,
    recent_blockers: [...new Set(recentBlockers)],
    high_risk_contract_status: summarizeObject(highRiskStatus),
    doctor: {
      fast: summarizeObject(doctorFast),
      full: summarizeObject(doctorFull)
    },
    retention_status: summarizeObject(retentionStatus),
    package_surface_summary: {
      bin: packageJson?.bin && typeof packageJson.bin === 'object' ? Object.keys(packageJson.bin) : [],
      files_count: Array.isArray(packageJson?.files) ? packageJson.files.length : 0,
      scripts_count: packageJson?.scripts && typeof packageJson.scripts === 'object' ? Object.keys(packageJson.scripts).length : 0
    },
    redacted_env_keys: Object.keys(process.env).filter((key) => secretLike(key)).sort(),
    secret_scan: {
      raw_values_recorded: false,
      suspicious_key_count: Object.keys(process.env).filter((key) => secretLike(key)).length
    }
  };
}

export async function writeOpsDiagnosticsBundle(root: string): Promise<string> {
  const bundle = await buildOpsDiagnosticsBundle(root);
  return writeOpsReport(root, 'ops-diagnostics-bundle.json', bundle);
}

async function latestMission(root: string): Promise<Record<string, unknown> | null> {
  const missionsDir = path.join(root, '.sneakoscope', 'missions');
  const entries = await fs.readdir(missionsDir, { withFileTypes: true }).catch(() => []);
  const dirs = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith('M-')).map((entry) => entry.name).sort().reverse();
  for (const id of dirs) {
    const mission = await readJsonFile(path.join(missionsDir, id, 'mission.json'));
    if (mission) {
      return {
        id,
        mode: mission.mode ?? null,
        phase: mission.phase ?? null,
        created_at: mission.created_at ?? null,
        blockers: Array.isArray(mission.blockers) ? mission.blockers.slice(0, 10) : []
      };
    }
  }
  return null;
}

async function hashIfExists(file: string): Promise<string | null> {
  try {
    return createHash('sha256').update(await fs.readFile(file)).digest('hex');
  } catch {
    return null;
  }
}

function blockersOf(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const blockers = (value as { blockers?: unknown }).blockers;
  return Array.isArray(blockers) ? blockers.map(String) : [];
}

function summarizeObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  return {
    schema: input.schema ?? null,
    ok: input.ok ?? null,
    status: input.status ?? null,
    blockers: Array.isArray(input.blockers) ? input.blockers.slice(0, 10) : []
  };
}

function secretLike(key: string): boolean {
  return /(?:TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL|AUTH)/i.test(key);
}
