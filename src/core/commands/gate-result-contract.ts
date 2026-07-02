export const GATE_RESULT_CONTRACT = 'sks.gate-result.v1' as const;

export interface GateResultContract {
  schema: typeof GATE_RESULT_CONTRACT;
  ok: boolean;
  blockers: unknown[];
  [key: string]: unknown;
}

export interface GateProcessEvaluation {
  ok: boolean;
  contract: typeof GATE_RESULT_CONTRACT | 'legacy_exit_code_only';
  gate_result: GateResultContract | null;
  reason?: 'gate_output_contract_violation' | 'gate_result_not_ok' | 'legacy_exit_code_only';
}

export function parseGateResultFromStdout(stdout: string): GateResultContract | null {
  const lines = String(stdout || '').trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const last = lines.at(-1);
  if (!last) return null;
  try {
    const parsed = JSON.parse(last) as Partial<GateResultContract>;
    if (parsed?.schema === GATE_RESULT_CONTRACT && typeof parsed.ok === 'boolean' && Array.isArray(parsed.blockers)) {
      return parsed as GateResultContract;
    }
    return null;
  } catch {
    return null;
  }
}

export function evaluateGateProcessOutput({
  status,
  stdout,
  requiresContract = false
}: {
  status: number | null;
  stdout: string;
  requiresContract?: boolean;
}): GateProcessEvaluation {
  const gateResult = parseGateResultFromStdout(stdout);
  if (!gateResult) {
    if (requiresContract) {
      return {
        ok: false,
        contract: GATE_RESULT_CONTRACT,
        gate_result: null,
        reason: 'gate_output_contract_violation'
      };
    }
    return {
      ok: status === 0,
      contract: 'legacy_exit_code_only',
      gate_result: null,
      ...(status === 0 ? { reason: 'legacy_exit_code_only' as const } : {})
    };
  }
  return {
    ok: status === 0 && gateResult.ok === true,
    contract: GATE_RESULT_CONTRACT,
    gate_result: gateResult,
    ...(gateResult.ok === true ? {} : { reason: 'gate_result_not_ok' as const })
  };
}
