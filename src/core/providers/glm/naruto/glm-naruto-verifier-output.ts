export interface GlmNarutoVerifierOutput {
  readonly schema: 'sks.glm-naruto-verifier-output.v1';
  readonly ok: boolean;
  readonly issues: readonly string[];
  readonly risk_score: number;
  readonly confidence: number;
  readonly requirements_satisfied?: readonly string[];
  readonly requirements_missing?: readonly string[];
  readonly detail_loss_risks?: readonly string[];
}

export function parseGlmNarutoVerifierOutput(content: string): {
  readonly ok: boolean;
  readonly output?: GlmNarutoVerifierOutput;
  readonly issues: readonly string[];
} {
  try {
    const parsed = JSON.parse(stripJsonFences(content)) as Record<string, unknown>;
    const issues: string[] = [];
    if (parsed.schema !== 'sks.glm-naruto-verifier-output.v1') issues.push('schema');
    if (typeof parsed.ok !== 'boolean') issues.push('ok');
    if (!Array.isArray(parsed.issues) || parsed.issues.some((issue) => typeof issue !== 'string')) issues.push('issues');
    if (typeof parsed.risk_score !== 'number' || parsed.risk_score < 0 || parsed.risk_score > 1) issues.push('risk_score');
    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) issues.push('confidence');
    for (const key of ['requirements_satisfied', 'requirements_missing', 'detail_loss_risks']) {
      if (parsed[key] !== undefined && (!Array.isArray(parsed[key]) || (parsed[key] as unknown[]).some((item) => typeof item !== 'string'))) {
        issues.push(key);
      }
    }
    if (issues.length) return { ok: false, issues: issues.map((issue) => `invalid_${issue}`) };
    return { ok: true, output: parsed as unknown as GlmNarutoVerifierOutput, issues: [] };
  } catch {
    return { ok: false, issues: ['malformed_json'] };
  }
}

function stripJsonFences(content: string): string {
  return content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}
