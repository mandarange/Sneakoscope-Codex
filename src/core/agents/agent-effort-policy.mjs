const XHIGH_SIGNAL_RE = /(frontier|autoresearch|novelty|hypothesis|falsif|forensic|from-chat-img|image\s*work\s*order|새로운\s*연구|가설|포렌식)/i;
const HIGH_SIGNAL_RE = /(database|supabase|sql|migration|security|permission|mad|release|publish|deploy|architecture|policy|schema|hook|rollback|db|보안|배포|마이그레이션|데이터베이스|권한|릴리즈)/i;
const MEDIUM_SIGNAL_RE = /(tmux|terminal|cli|tool(?:\s|-)?call|router|routing|orchestrat|pipeline|multi[-\s]?session|multi[-\s]?agent|lease|ledger|proof|검증|파이프라인|오케스트레이션|병렬|에이전트)/i;
const SIMPLE_SIGNAL_RE = /(tiny|simple|small|one[-\s]?line|typo|copy|label|spacing|rename|readme|docs?|간단|단순|오타|문구|라벨)/i;
export function decideAgentEffort(input = {}) {
    const persona = input.persona || {};
    const prompt = String(input.prompt || '');
    const role = String(persona.role || '');
    const agentId = String(input.agentId || persona.id || 'agent');
    const text = [prompt, role, persona.risk_focus, persona.write_policy, persona.stable_id].join(' ');
    let effort = promptEffort(text);
    let reason = effortReason(effort);
    if (/(db|safety|security|release|schema)/i.test([role, agentId, persona.stable_id, persona.risk_focus].join(' '))) {
        effort = effort === 'xhigh' ? 'xhigh' : 'high';
        reason = 'risk_guardian_lane';
    }
    else if (/(integrator|architect|verifier)/i.test([role, agentId, persona.stable_id].join(' ')) && effort === 'low') {
        effort = 'medium';
        reason = 'planning_verification_minimum';
    }
    else if (input.readonly === true && SIMPLE_SIGNAL_RE.test(prompt) && !HIGH_SIGNAL_RE.test(text) && !MEDIUM_SIGNAL_RE.test(text)) {
        effort = 'low';
        reason = 'read_only_simple_slice';
    }
    else if (/implementer/i.test(role) && effort === 'xhigh') {
        effort = 'high';
        reason = 'implementation_lane_capped_at_high';
    }
    return {
        schema: 'sks.agent-effort-decision.v1',
        policy_version: 1,
        agent_id: agentId,
        role,
        reasoning_effort: effort,
        model_reasoning_effort: effort,
        reasoning_profile: reasoningProfileName(effort),
        service_tier: 'fast',
        reason,
        dynamic: true,
        escalation_triggers: [
            'DB/security/release/schema risk detected',
            'lease conflict or proof blocker appears',
            'verification fails or output schema validation fails',
            'user requests real backend or broader agent fan-out'
        ],
        downshift_triggers: [
            'read-only simple docs/copy slice',
            'mock fixture backend with no risky file ownership',
            'agent assigned narrow inventory-only work'
        ]
    };
}
export function buildAgentEffortPolicy(roster = {}) {
    const decisions = Array.isArray(roster.roster) ? roster.roster.map((agent) => ({
        agent_id: agent.id,
        session_id: agent.session_id,
        role: agent.role,
        reasoning_effort: agent.reasoning_effort,
        reasoning_profile: agent.reasoning_profile,
        reason: agent.reasoning_reason,
        dynamic: true
    })) : [];
    return {
        schema: 'sks.agent-effort-policy.v1',
        policy_version: 1,
        dynamic: true,
        service_tier: 'fast',
        allowed_efforts: ['low', 'medium', 'high', 'xhigh'],
        max_agents: roster.max_agents || 20,
        agent_count: roster.agent_count || decisions.length,
        concurrency: roster.concurrency || decisions.length,
        decisions,
        rule: 'Parent orchestration assigns per-agent effort from prompt risk, persona role, lease ownership, and proof state; lanes can escalate on blockers and downshift for narrow read-only work.'
    };
}
export function reasoningProfileName(effort) {
    return 'sks-agent-' + String(effort || 'medium') + '-fast';
}
function promptEffort(text) {
    if (XHIGH_SIGNAL_RE.test(text))
        return 'xhigh';
    if (HIGH_SIGNAL_RE.test(text))
        return 'high';
    if (SIMPLE_SIGNAL_RE.test(text) && !MEDIUM_SIGNAL_RE.test(text))
        return 'low';
    if (MEDIUM_SIGNAL_RE.test(text))
        return 'medium';
    return 'medium';
}
function effortReason(effort) {
    if (effort === 'xhigh')
        return 'frontier_or_forensic_signal';
    if (effort === 'high')
        return 'safety_release_db_schema_signal';
    if (effort === 'low')
        return 'simple_bounded_slice';
    return 'default_orchestration_slice';
}
//# sourceMappingURL=agent-effort-policy.js.map