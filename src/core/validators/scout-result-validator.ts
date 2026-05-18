import { isScoutOutput, type ScoutOutput } from '../scouts/scout-schema.js';
import { ValidationError } from './validation-error.js';

export function parseScoutOutput(value: unknown): ScoutOutput {
  if (!isScoutOutput(value)) throw new ValidationError('sks.scout-output.v1');
  return value;
}
