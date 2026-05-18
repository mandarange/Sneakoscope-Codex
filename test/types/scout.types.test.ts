import {
  SCOUT_OUTPUT_SCHEMA,
  isScoutOutput,
  type ScoutOutput
} from '../../src/core/scouts/scout-schema.js';

const output: ScoutOutput = {
  schema: SCOUT_OUTPUT_SCHEMA,
  scout_id: 'scout-1-code-surface',
  read_only: true,
  findings: [{
    id: 'finding-001',
    claim: 'typed scout output remains read-only',
    source_path: 'src/core/scouts/scout-schema.ts',
    confidence: 'high'
  }],
  suggested_tasks: ['keep scout output contracts typed']
};

const guardResult: boolean = isScoutOutput(output);

void guardResult;
