import fs from 'node:fs';
import path from 'node:path';
import { hashJson } from '../triwiki/triwiki-cache-key.js';

export const DOCTOR_DIRTY_PLAN_SCHEMA = 'sks.doctor-dirty-plan.v1';

export interface DoctorDirtyPlan {
  schema: typeof DOCTOR_DIRTY_PLAN_SCHEMA;
  root: string;
  phases: DoctorDirtyPhase[];
  dirty_count: number;
  clean_count: number;
}

export interface DoctorDirtyPhase {
  id: string;
  status: 'dirty' | 'clean' | 'unknown';
  reason: string;
  input_hash: string;
  last_clean_proof_id: string | null;
  postcheck_required: boolean;
}

export function planDoctorDirtyRepair(root: string, phaseIds: string[]): DoctorDirtyPlan {
  const phases = phaseIds.map((id) => {
    const marker = markerPath(root, id);
    const inputHash = phaseInputHash(root, id);
    const postcheckRequired = phaseRequiresPostcheck(id);
    const markerState = readMarker(marker);
    if (!markerState) return { id, status: 'dirty' as const, reason: 'no_clean_marker', input_hash: inputHash, last_clean_proof_id: null, postcheck_required: postcheckRequired };
    if (markerState.input_hash !== inputHash) {
      return { id, status: 'dirty' as const, reason: 'input_hash_changed', input_hash: inputHash, last_clean_proof_id: markerState.proof_id, postcheck_required: postcheckRequired };
    }
    if (postcheckRequired && !markerState.postcheck_passed) {
      return { id, status: 'dirty' as const, reason: 'postcheck_required', input_hash: inputHash, last_clean_proof_id: markerState.proof_id, postcheck_required: true };
    }
    return { id, status: 'clean' as const, reason: 'matching_clean_proof', input_hash: inputHash, last_clean_proof_id: markerState.proof_id, postcheck_required: postcheckRequired };
  });
  const plan: DoctorDirtyPlan = {
    schema: DOCTOR_DIRTY_PLAN_SCHEMA,
    root,
    phases,
    dirty_count: phases.filter((phase) => phase.status === 'dirty').length,
    clean_count: phases.filter((phase) => phase.status === 'clean').length
  };
  writeDirtyPlan(root, plan);
  return plan;
}

export function markDoctorPhaseClean(root: string, id: string): void {
  const file = markerPath(root, id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ schema: 'sks.doctor-dirty-clean-proof.v1', proof_id: `doctor-${id}-${Date.now()}`, cleaned_at: new Date().toISOString(), input_hash: phaseInputHash(root, id), postcheck_passed: true }, null, 2)}\n`);
}

export function isDoctorPhaseClean(plan: DoctorDirtyPlan | null | undefined, id: string): boolean {
  return plan?.phases.find((phase) => phase.id === id)?.status === 'clean';
}

function markerPath(root: string, id: string): string {
  return path.join(root, '.sneakoscope', 'cache', 'doctor-dirty', `${id.replace(/[^a-zA-Z0-9._-]+/g, '_')}.clean`);
}

function readMarker(file: string): { proof_id: string | null; input_hash: string | null; postcheck_passed: boolean } | null {
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.trim().startsWith('{')) return { proof_id: null, input_hash: null, postcheck_passed: false };
    const json = JSON.parse(raw) as { proof_id?: string; input_hash?: string; postcheck_passed?: boolean };
    return { proof_id: json.proof_id || null, input_hash: json.input_hash || null, postcheck_passed: json.postcheck_passed === true };
  } catch {
    return null;
  }
}

function phaseInputHash(root: string, id: string): string {
  const files = phaseInputFiles(id).map((rel) => {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) return { rel, hash: 'missing' };
    const stat = fs.statSync(file);
    return { rel, hash: stat.isDirectory() ? `dir:${stat.mtimeMs}` : hashJson({ size: stat.size, mtimeMs: stat.mtimeMs, text: stat.size < 512_000 ? fs.readFileSync(file, 'utf8') : '' }) };
  });
  return hashJson({ id, files, env: phaseEnvPresence(id) });
}

function phaseInputFiles(id: string): string[] {
  if (id.includes('zellij')) return ['src/core/zellij', 'src/core/doctor/doctor-zellij-repair.ts'];
  if (id.includes('context7')) return ['src/core/doctor/context7-mcp-repair.ts', '.codex/config.toml'];
  if (id.includes('startup')) return ['src/core/doctor/codex-startup-config-repair.ts', '.codex/config.toml'];
  if (id.includes('supabase')) return ['src/core/doctor/supabase-mcp-repair.ts', '.codex/config.toml'];
  if (id.includes('skill')) return ['.agents/skills', 'src/scripts/skill-registry-ledger-check.ts'];
  if (id.includes('native')) return ['src/core/codex-native', 'src/scripts/native-capability-postcheck-check.ts'];
  if (id.includes('secret')) return ['safety-mutation-allowlist.json', 'src/scripts/secret-preservation-check.ts'];
  return ['package.json', 'src/core/doctor'];
}

function phaseEnvPresence(id: string): Record<string, boolean> {
  const keys = id.includes('supabase') ? ['SUPABASE_ACCESS_TOKEN'] : id.includes('context7') ? ['CONTEXT7_API_KEY'] : [];
  return Object.fromEntries(keys.map((key) => [key, process.env[key] !== undefined]));
}

function phaseRequiresPostcheck(id: string): boolean {
  return /zellij|context7|startup|supabase|native|secret/i.test(id);
}

function writeDirtyPlan(root: string, plan: DoctorDirtyPlan): void {
  const file = path.join(root, '.sneakoscope', 'reports', 'doctor-dirty-plan.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(plan, null, 2)}\n`);
}
