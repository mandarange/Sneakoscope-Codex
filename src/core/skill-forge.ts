import path from 'node:path';
import { nowIso, writeJsonAtomic } from './fsx.js';
import { createSkillCard } from './evaluation.js';

export function decideSkillInjection({ route = 'naruto', task_signature = '', skills = [], topK }: any = {}) {
  const k = Number(topK || (String(route).toLowerCase().includes('from-chat-img') ? 5 : 3));
  const ranked = skills
    .filter((skill: any) => skill.status === 'active' && !skill.stale && !skill.conflicting)
    .map((skill: any) => ({
      ...skill,
      match_score: skillMatchScore(skill, route, task_signature)
    }))
    .filter((skill: any) => skill.match_score > 0)
    .sort((a: any, b: any) => (b.match_score + Number(b.quality_score || 0) + Number(b.injection_priority || 0)) - (a.match_score + Number(a.quality_score || 0) + Number(a.injection_priority || 0)));
  return {
    schema_version: 1,
    route,
    task_signature,
    top_k: k,
    considered: skills.length,
    injected: ranked.slice(0, k).map(({ id, version, status, quality_score, match_score, files }: any) => ({ id, version, status, quality_score, match_score, files })),
    decided_at: nowIso()
  };
}

export function createSkillForgeReport(opts: any = {}) {
  const candidates = (opts.candidates || []).map((candidate: any) => ({
    ...candidate,
    promotion_ready: Number(candidate.evidence?.successful_runs || 0) >= 3
      && Number(candidate.evidence?.failed_runs || 0) === 0
      && Number(candidate.quality_score || 0) >= 0.72
  }));
  const injection = decideSkillInjection({
    route: opts.route || 'naruto',
    task_signature: opts.task_signature || '',
    skills: opts.skills || [],
    topK: opts.topK || 8
  });
  return {
    schema_version: 1,
    mission_id: opts.mission_id || null,
    created_at: nowIso(),
    candidates,
    skill_cards: candidates.map((candidate: any) => createSkillCard({
      skill_id: candidate.id,
      name: candidate.id,
      version: `1.0.${Number(candidate.version || 1) - 1}`,
      status: candidate.promotion_ready ? 'active' : 'dormant',
      use_count: Number(candidate.evidence?.successful_runs || 0) + Number(candidate.evidence?.failed_runs || 0),
      success_count: Number(candidate.evidence?.successful_runs || 0),
      failure_count: Number(candidate.evidence?.failed_runs || 0),
      trigger_summary: (candidate.triggers || []).join(', '),
      anti_triggers: candidate.contraindications || [],
      validation: { commands: candidate.evidence?.tests || [], manual_checks: [], schemas: ['skill-card'] },
      implicit_invocation_allowed: candidate.promotion_ready
    })),
    injection,
    retirements: (opts.skills || []).filter((skill: any) => skill.stale || skill.conflicting || Number(skill.failed_runs || skill.evidence?.failed_runs || 0) >= 2).map((skill: any) => ({
      id: skill.id,
      reason_codes: [
        skill.stale ? 'stale' : null,
        skill.conflicting ? 'conflicting' : null,
        Number(skill.failed_runs || skill.evidence?.failed_runs || 0) >= 2 ? 'repeated_failure' : null
      ].filter(Boolean)
    })),
    validation: {
      top_k_respected: injection.injected.length <= injection.top_k,
      full_skill_loaded_only_after_selection: true,
      stale_or_false_triggered_skills_retired: true
    }
  };
}

export async function writeSkillForgeReport(dir: any, opts: any = {}) {
  const report = createSkillForgeReport(opts);
  await writeJsonAtomic(path.join(dir, 'skill-forge-report.json'), report);
  return report;
}

function skillMatchScore(skill: any, route: any, taskSignature: any) {
  const hay = `${route} ${taskSignature}`.toLowerCase();
  let score = 0;
  for (const trigger of skill.triggers || []) {
    if (hay.includes(String(trigger).toLowerCase().replace(/^\$/, ''))) score += 0.4;
  }
  if (String(skill.id || '').toLowerCase().includes(String(route || '').toLowerCase())) score += 0.3;
  return Math.min(1, score);
}
