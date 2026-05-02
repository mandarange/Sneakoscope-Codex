import path from 'node:path';
import { nowIso, writeJsonAtomic } from './fsx.mjs';
import { ARTIFACT_FILES, validateSkillCandidate, validateSkillInjectionDecision } from './artifact-schemas.mjs';

export function createSkillCandidate(opts = {}) {
  const successfulRuns = Number(opts.evidence?.successful_runs || opts.successful_runs || 0);
  const failedRuns = Number(opts.evidence?.failed_runs || opts.failed_runs || 0);
  const passRate = successfulRuns + failedRuns > 0 ? successfulRuns / (successfulRuns + failedRuns) : 0;
  return {
    schema_version: 1,
    id: opts.id || `skill.${safeId(opts.route || 'general')}.${safeId(opts.name || 'candidate')}.v1`,
    version: Number(opts.version || 1),
    status: opts.status || 'candidate',
    triggers: opts.triggers || [],
    contraindications: opts.contraindications || [],
    evidence: {
      successful_runs: successfulRuns,
      failed_runs: failedRuns,
      last_verified_at: opts.evidence?.last_verified_at || opts.last_verified_at || null,
      tests: opts.evidence?.tests || opts.tests || []
    },
    quality_score: Number(opts.quality_score ?? Math.min(1, passRate * 0.7 + Math.min(successfulRuns, 5) * 0.06)),
    risk_score: Number(opts.risk_score ?? (failedRuns > 0 ? 0.4 : 0.2)),
    injection_priority: Number(opts.injection_priority ?? 0.5),
    files: opts.files || []
  };
}

export function decideSkillInjection({ route = 'team', task_signature = '', skills = [], topK } = {}) {
  const k = Number(topK || (String(route).toLowerCase().includes('from-chat-img') ? 5 : 3));
  const ranked = skills
    .filter((skill) => skill.status === 'active' && !skill.stale && !skill.conflicting)
    .map((skill) => ({
      ...skill,
      match_score: skillMatchScore(skill, route, task_signature)
    }))
    .filter((skill) => skill.match_score > 0)
    .sort((a, b) => (b.match_score + Number(b.quality_score || 0) + Number(b.injection_priority || 0)) - (a.match_score + Number(a.quality_score || 0) + Number(a.injection_priority || 0)));
  return {
    schema_version: 1,
    route,
    task_signature,
    top_k: k,
    considered: skills.length,
    injected: ranked.slice(0, k).map(({ id, version, status, quality_score, match_score, files }) => ({ id, version, status, quality_score, match_score, files })),
    decided_at: nowIso()
  };
}

export async function writeSkillCandidate(dir, opts = {}) {
  const candidate = createSkillCandidate(opts);
  await writeJsonAtomic(path.join(dir, ARTIFACT_FILES.skill_candidate), candidate);
  return validateSkillCandidate(candidate);
}

export async function writeSkillInjectionDecision(dir, opts = {}) {
  const decision = decideSkillInjection(opts);
  await writeJsonAtomic(path.join(dir, ARTIFACT_FILES.skill_injection_decision), decision);
  return validateSkillInjectionDecision(decision);
}

export function createSkillForgeReport(opts = {}) {
  const candidates = (opts.candidates || []).map((candidate) => ({
    ...candidate,
    promotion_ready: Number(candidate.evidence?.successful_runs || 0) >= 3
      && Number(candidate.evidence?.failed_runs || 0) === 0
      && Number(candidate.quality_score || 0) >= 0.72
  }));
  const injection = decideSkillInjection({
    route: opts.route || 'team',
    task_signature: opts.task_signature || '',
    skills: opts.skills || [],
    topK: opts.topK || 8
  });
  return {
    schema_version: 1,
    mission_id: opts.mission_id || null,
    created_at: nowIso(),
    candidates,
    injection,
    retirements: (opts.skills || []).filter((skill) => skill.stale || skill.conflicting || Number(skill.failed_runs || skill.evidence?.failed_runs || 0) >= 2).map((skill) => ({
      id: skill.id,
      reason_codes: [
        skill.stale ? 'stale' : null,
        skill.conflicting ? 'conflicting' : null,
        Number(skill.failed_runs || skill.evidence?.failed_runs || 0) >= 2 ? 'repeated_failure' : null
      ].filter(Boolean)
    })),
    validation: {
      top_k_respected: injection.injected.length <= injection.top_k,
      full_skill_loaded_only_after_selection: true
    }
  };
}

export async function writeSkillForgeReport(dir, opts = {}) {
  const report = createSkillForgeReport(opts);
  await writeJsonAtomic(path.join(dir, 'skill-forge-report.json'), report);
  return report;
}

function skillMatchScore(skill, route, taskSignature) {
  const hay = `${route} ${taskSignature}`.toLowerCase();
  let score = 0;
  for (const trigger of skill.triggers || []) {
    if (hay.includes(String(trigger).toLowerCase().replace(/^\$/, ''))) score += 0.4;
  }
  if (String(skill.id || '').toLowerCase().includes(String(route || '').toLowerCase())) score += 0.3;
  return Math.min(1, score);
}

function safeId(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}
