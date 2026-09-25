import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readJson, runProcess } from '../fsx.js';
import { runPackageLocalDoctor, type PackageLocalDoctorRun } from './update-migration-state.js';
import { compareSemVer, extractSemVer } from './semver.js';

export interface TemporaryInstallSmokeResult {
  schema: 'sks.update-temporary-install-smoke.v1';
  ok: boolean;
  /** `not_yet_downloadable`: the registry lists the version but still 404s its tarball after the wait. */
  status: 'verified' | 'skipped' | 'install_failed' | 'not_yet_downloadable' | 'manifest_invalid' | 'version_failed' | 'doctor_failed';
  package: string;
  version: string;
  npm_args: string[];
  install_code: number | null;
  entrypoint: string | null;
  manifest_version: string | null;
  probed_version: string | null;
  doctor: PackageLocalDoctorRun | null;
  error: string | null;
  /** How long SKS waited for a just-published tarball to become downloadable. */
  publish_wait_ms?: number;
}

/**
 * npm lists a new version minutes before its tarball is served (the publish
 * answers "may take a few minutes to become available"). An update that lands
 * in that gap sees E404/ETARGET for a version the registry just advertised.
 */
export function isPublishPropagationError(text: string): boolean {
  return /\bE404\b|\bETARGET\b|No matching version found|404 Not Found - GET [^\s]+\.tgz/i.test(text);
}

/** Default wait for a just-published tarball; `SKS_UPDATE_PUBLISH_WAIT_MS` overrides (0 disables). */
export const PUBLISH_PROPAGATION_WAIT_MS = 6 * 60 * 1000;
const PUBLISH_PROPAGATION_RETRY_MS = 20 * 1000;

export async function runTemporaryInstallSmoke(input: {
  npmBin: string;
  packageName: string;
  version: string;
  registry: string;
  env: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxOutputBytes?: number;
  /** Called while waiting for a just-published tarball. */
  onPublishWait?: (waitedMs: number) => void;
  sleep?: (ms: number) => Promise<void>;
}): Promise<TemporaryInstallSmokeResult> {
  const npmArgs: string[] = [];
  if (input.env.SKS_UPDATE_SKIP_TEMP_INSTALL_SMOKE === '1') {
    return result(input, npmArgs, true, 'skipped', null, null, null, null, null, 'explicitly skipped by SKS_UPDATE_SKIP_TEMP_INSTALL_SMOKE=1');
  }
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-update-smoke-'));
  try {
    const fixtureEntrypoint = String(input.env.SKS_UPDATE_TEMP_INSTALL_FIXTURE_ENTRYPOINT || '').trim();
    let entrypoint: string;
    let manifestVersion: string | null = null;
    let installCode: number | null = null;
    if (fixtureEntrypoint) {
      entrypoint = path.resolve(fixtureEntrypoint);
    } else {
      npmArgs.push(
        'install', '--prefix', temp, `${input.packageName}@${input.version}`,
        '--registry', input.registry, '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-online'
      );
      const waitBudget = publishWaitBudgetMs(input.env);
      const sleep = input.sleep || ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
      const started = Date.now();
      let install: { code: number | null; stdout?: string; stderr?: string };
      // Retry only the "listed but not downloadable yet" case; any other npm
      // failure is reported at once.
      for (;;) {
        install = await runProcess(input.npmBin, npmArgs, {
          cwd: temp,
          env: input.env,
          timeoutMs: input.timeoutMs ?? 3 * 60 * 1000,
          maxOutputBytes: input.maxOutputBytes ?? 128 * 1024
        }).catch((error: unknown) => ({
          code: 1,
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          timedOut: false
        }));
        const output = `${install.stderr || ''}\n${install.stdout || ''}`;
        const waited = Date.now() - started;
        if (install.code === 0 || !isPublishPropagationError(output) || waited >= waitBudget) break;
        input.onPublishWait?.(waited);
        await sleep(Math.min(PUBLISH_PROPAGATION_RETRY_MS, waitBudget - waited));
      }
      installCode = install.code;
      const waitedMs = Date.now() - started;
      if (install.code !== 0) {
        const output = String(install.stderr || install.stdout || 'temporary npm install failed').trim();
        // Nothing was installed yet, so the current version is untouched.
        const pendingMessage = `${input.packageName}@${input.version} is published but npm has not finished distributing it (waited ${Math.round(waitedMs / 1000)}s). Your current version keeps working; run sks update again in a few minutes.`;
        return isPublishPropagationError(output)
          ? { ...result(input, npmArgs, false, 'not_yet_downloadable', installCode, null, null, null, null, pendingMessage), publish_wait_ms: waitedMs }
          : { ...result(input, npmArgs, false, 'install_failed', installCode, null, null, null, null, output), publish_wait_ms: waitedMs };
      }
      const packageRoot = path.join(temp, 'node_modules', input.packageName);
      const manifest = await readJson<any>(path.join(packageRoot, 'package.json'), null).catch(() => null);
      manifestVersion = typeof manifest?.version === 'string' ? manifest.version : null;
      entrypoint = path.join(packageRoot, 'dist', 'bin', 'sks.js');
      if (compareSemVer(manifestVersion, input.version) !== 0 || !await regularFile(entrypoint)) {
        return result(input, npmArgs, false, 'manifest_invalid', installCode, entrypoint, manifestVersion, null, null, 'temporary package manifest or dist/bin/sks.js did not match the target version');
      }
    }
    if (!await regularFile(entrypoint)) {
      return result(input, npmArgs, false, 'manifest_invalid', installCode, entrypoint, manifestVersion, null, null, 'temporary package entrypoint missing');
    }
    const probe = await runProcess(process.execPath, [entrypoint, '--version'], {
      cwd: temp,
      env: { ...input.env, HOME: temp, SKS_DISABLE_UPDATE_CHECK: '1', SKS_UPDATE_MIGRATION_GATE_DISABLED: '1' },
      timeoutMs: 10_000,
      maxOutputBytes: 8 * 1024
    }).catch((error: unknown) => ({ code: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) }));
    const probedVersion = probe.code === 0 ? extractSemVer(`${probe.stdout || ''}\n${probe.stderr || ''}`) : null;
    if (compareSemVer(probedVersion, input.version) !== 0) {
      return result(input, npmArgs, false, 'version_failed', installCode, entrypoint, manifestVersion, probedVersion, null, String(probe.stderr || probe.stdout || 'temporary version probe failed').trim());
    }
    const doctor = await runPackageLocalDoctor({
      root: temp,
      entrypoint,
      args: ['doctor', '--json'],
      env: { ...input.env, HOME: temp, SKS_GLOBAL_ROOT: path.join(temp, '.sneakoscope-global') },
      timeoutMs: 60_000,
      maxOutputBytes: 32 * 1024
    });
    if (!doctor.ok) {
      return result(input, npmArgs, false, 'doctor_failed', installCode, entrypoint, manifestVersion, probedVersion, doctor, doctor.error || 'temporary package doctor failed');
    }
    return result(input, npmArgs, true, 'verified', installCode, entrypoint, manifestVersion, probedVersion, doctor, null);
  } finally {
    await fs.rm(temp, { recursive: true, force: true }).catch(() => undefined);
  }
}

function result(
  input: { packageName: string; version: string },
  npmArgs: string[],
  ok: boolean,
  status: TemporaryInstallSmokeResult['status'],
  installCode: number | null,
  entrypoint: string | null,
  manifestVersion: string | null,
  probedVersion: string | null,
  doctor: PackageLocalDoctorRun | null,
  error: string | null
): TemporaryInstallSmokeResult {
  return {
    schema: 'sks.update-temporary-install-smoke.v1',
    ok,
    status,
    package: input.packageName,
    version: input.version,
    npm_args: npmArgs,
    install_code: installCode,
    entrypoint,
    manifest_version: manifestVersion,
    probed_version: probedVersion,
    doctor,
    error
  };
}

function publishWaitBudgetMs(env: NodeJS.ProcessEnv): number {
  const raw = env.SKS_UPDATE_PUBLISH_WAIT_MS;
  if (raw === undefined || raw === '') return PUBLISH_PROPAGATION_WAIT_MS;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : PUBLISH_PROPAGATION_WAIT_MS;
}

async function regularFile(file: string): Promise<boolean> {
  const stat = await fs.stat(file).catch(() => null);
  return Boolean(stat?.isFile());
}
