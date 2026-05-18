export const SCOUT_OUTPUT_SCHEMA = 'sks.scout-output.v1' as const;

export interface ScoutFinding {
  id: string;
  claim: string;
  source_path: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ScoutOutput {
  schema: typeof SCOUT_OUTPUT_SCHEMA;
  scout_id: string;
  read_only: true;
  findings: ScoutFinding[];
  suggested_tasks: string[];
}

export function isScoutOutput(value: unknown): value is ScoutOutput {
  if (!value || typeof value !== 'object') return false;
  const output = value as Partial<ScoutOutput>;
  return output.schema === SCOUT_OUTPUT_SCHEMA
    && typeof output.scout_id === 'string'
    && output.read_only === true
    && Array.isArray(output.findings)
    && Array.isArray(output.suggested_tasks);
}
