#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { root as repoRoot } from './sks-1-18-gate-lib.js';
import { assertGate, emitGate, makeTempRoot, writeManagedCoreSkill, writeText, writeUserSkill } from './sks-3-1-8-check-lib.js';
import { syncCoreSkillsIntegrity } from '../core/codex-native/core-skill-integrity.js';
import { dedupeProjectSkills } from '../core/codex-native/project-skill-dedupe.js';
import { repairNativeCapabilities } from '../core/codex-native/native-capability-repair.js';
import { withSecretPreservationGuard } from '../core/config/secret-preservation.js';
import { runProcess } from '../core/fsx.js';
import { buildReleaseGateScriptParityReport } from './release-gate-script-parity-check.js';

const root = await makeTempRoot('sks-3110-all-feature-');
process.env.CODEX_HOME = path.join(root, 'codex-home');
const parity = buildReleaseGateScriptParityReport();

const coreA = await syncCoreSkillsIntegrity({ root, apply: true });
const coreB = await syncCoreSkillsIntegrity({ root, apply: true });
const loopPath = path.join(root, '.agents', 'skills', 'loop', 'SKILL.md');
await fs.appendFile(loopPath, '\ncorruption\n', 'utf8');
const coreC = await syncCoreSkillsIntegrity({ root, apply: true });

await writeManagedCoreSkill(root, '.codex/skills', 'loop');
const dedupeA = await dedupeProjectSkills({ root, fix: true, yes: true });
await writeUserSkill(root, '.agents/skills', 'user-loop-a', 'Loop');
await writeUserSkill(root, '.codex/skills', 'user-loop-b', 'loop');
const dedupeB = await dedupeProjectSkills({ root, fix: true, yes: false });
const dedupeC = await dedupeProjectSkills({ root, fix: true, yes: true, quarantineUserDuplicates: true });

process.env.SKS_CHROME_EXTENSION_READY = '1';
process.env.SKS_COMPUTER_USE_CAPABILITY = 'verified';
const repairable = await repairNativeCapabilities({ root, fix: true, yes: true, fixture: 'all-repairable' });
delete process.env.SKS_CHROME_EXTENSION_READY;
delete process.env.SKS_COMPUTER_USE_CAPABILITY;
const manual = await repairNativeCapabilities({ root, fix: true, yes: true, fixture: 'manual-required' });

const envFile = path.join(root, '.env.local');
await writeText(envFile, 'NEXT_PUBLIC_SUPABASE_ANON_KEY=all-feature-secret\nSUPABASE_SERVICE_ROLE_KEY=service-secret\n');
await withSecretPreservationGuard(root, 'delete-secret-fixture', async () => {
  await fs.writeFile(envFile, 'NEXT_PUBLIC_SUPABASE_ANON_KEY=all-feature-secret\n', 'utf8');
});
let text = await fs.readFile(envFile, 'utf8');
assertGate(text.includes('SUPABASE_SERVICE_ROLE_KEY=service-secret'), 'delete fixture must restore missing Supabase service key', text);
await withSecretPreservationGuard(root, 'change-secret-fixture', async () => {
  await fs.writeFile(envFile, 'NEXT_PUBLIC_SUPABASE_ANON_KEY=changed\nSUPABASE_SERVICE_ROLE_KEY=service-secret\n', 'utf8');
});
text = await fs.readFile(envFile, 'utf8');
assertGate(text.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY=all-feature-secret'), 'change fixture must rollback Supabase anon key mutation', text);

const doctorRoot = await makeTempRoot('sks-3110-doctor-fix-');
await writeText(path.join(doctorRoot, 'package.json'), '{"name":"sks-3110-doctor-fixture","private":true}\n');
await writeText(path.join(doctorRoot, '.env.local'), 'NEXT_PUBLIC_SUPABASE_ANON_KEY=doctor-secret\n');
const fixtureBin = path.join(doctorRoot, 'codex-fixture');
await writeText(fixtureBin, '#!/usr/bin/env node\nconsole.log(JSON.stringify({ checks: { fixture: { category: "runtime", status: "ok" } } }));\n');
await fs.chmod(fixtureBin, 0o755);
const doctor = await runProcess(process.execPath, [
  path.join(repoRoot, 'dist', 'bin', 'sks.js'),
  'doctor',
  '--fix',
  '--local-only',
  '--yes',
  '--json',
  '--codex-bin',
  fixtureBin
], {
  cwd: doctorRoot,
  env: {
    HOME: path.join(doctorRoot, 'home'),
    CODEX_HOME: path.join(doctorRoot, 'codex-home'),
    SKS_GLOBAL_ROOT: path.join(doctorRoot, 'global-sks'),
    SKS_CHROME_EXTENSION_READY: '1',
    SKS_COMPUTER_USE_CAPABILITY: 'verified'
  },
  timeoutMs: 120_000,
  maxOutputBytes: 512 * 1024
});
const doctorGuardReport = JSON.parse(await fs.readFile(path.join(doctorRoot, '.sneakoscope', 'reports', 'secret-preservation-guard.json'), 'utf8')) as { raw_values_recorded?: boolean; ok?: boolean };
const guardReport = JSON.parse(await fs.readFile(path.join(root, '.sneakoscope', 'reports', 'secret-preservation-guard.json'), 'utf8')) as { rollback_attempted?: boolean; rollback_ok?: boolean };
const reportText = JSON.stringify(await readReports(path.join(root, '.sneakoscope', 'reports')));

assertGate(parity.ok === true, 'release gate/script/dist parity must pass inside all-feature regression', parity);
assertGate(coreA.installed_count > 0, 'core skills must install in temp root', coreA);
assertGate(coreB.installed_count === 0 && coreB.restored_count === 0, 'second core sync must be idempotent', coreB);
assertGate(coreC.restored_count > 0, 'corrupt managed core skill must restore', coreC);
assertGate(dedupeA.actions.some((action) => action.action === 'quarantined'), 'managed duplicate must quarantine', dedupeA);
assertGate(dedupeB.blockers.some((blocker) => blocker.includes('user_duplicate_requires_confirmation')), 'unconfirmed user duplicate must be manual_required', dedupeB);
assertGate(dedupeC.active_unique_by_canonical_name === true, 'confirmed user duplicate quarantine must restore active uniqueness', dedupeC);
assertGate(repairable.ok === true, 'all-repairable native fixture must pass postcheck', repairable);
assertGate(manual.capabilities.some((state) => state.repairability === 'manual-required' && state.after !== 'verified'), 'manual native fixture must not false-verify', manual);
assertGate(guardReport.rollback_attempted === true && guardReport.rollback_ok === true, 'secret guard must record rollback success', guardReport);
assertGate(!reportText.includes('all-feature-secret') && !reportText.includes('service-secret'), 'reports must not contain raw secret literals');
assertGate(doctor.code === 0, 'doctor --fix fixture must run under secret guard', { code: doctor.code, stdout: doctor.stdout.slice(-2000), stderr: doctor.stderr.slice(-2000) });
assertGate(doctorGuardReport.ok === true && doctorGuardReport.raw_values_recorded === false, 'doctor --fix guard report must be sanitized and successful', doctorGuardReport);

emitGate('sks:3110-all-feature-regression', {
  core_installed: coreA.installed_count,
  manual_native_count: manual.capabilities.filter((state) => state.repairability === 'manual-required' && state.after !== 'verified').length
});

async function readReports(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const rows = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const row of rows) {
    if (!row.isFile() || !row.name.endsWith('.json')) continue;
    out[row.name] = await fs.readFile(path.join(dir, row.name), 'utf8');
  }
  return out;
}
