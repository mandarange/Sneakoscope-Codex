import { judgmentSubagentModel, DEEP_SUBAGENT_EFFORT } from '../subagents/model-policy.js';

/** The three adversarial reviewers every research route spawns. */
export const RESEARCH_REVIEWER_CONTRACT = Object.freeze([
  {
    id: 'evidence',
    display_name: 'Evidence Reviewer',
    persona: 'source integrity and claim linkage reviewer',
    role: 'evidence_integrity_reviewer',
    mandate: 'Check that material claims are supported by current eligible sources and that counterevidence is represented.',
    required_outputs: ['strongest_challenge', 'evidence_source_ids', 'falsifiers', 'cheap_probes']
  },
  {
    id: 'method',
    display_name: 'Method Reviewer',
    persona: 'method and validity reviewer',
    role: 'method_validity_reviewer',
    mandate: 'Check assumptions, method validity, limits, and whether the proposed tests can distinguish the claim from alternatives.',
    required_outputs: ['strongest_challenge', 'method_limits', 'falsifiers', 'cheap_probes']
  },
  {
    id: 'falsification',
    display_name: 'Falsification Reviewer',
    persona: 'falsification and replication reviewer',
    role: 'falsification_replication_reviewer',
    mandate: 'Attack the strongest surviving claim with counterevidence, replication risks, and decisive failure conditions.',
    required_outputs: ['strongest_challenge', 'counterevidence', 'falsifiers', 'cheap_probes']
  }
].map((agent: any) => Object.freeze({
  ...agent,
  persona_boundary: 'Apply only the assigned review dimension and report evidence-bound findings.',
  custom_agent: 'research_reviewer',
  model: judgmentSubagentModel(),
  reasoning_effort: DEEP_SUBAGENT_EFFORT,
  service_tier: 'fast'
})));
