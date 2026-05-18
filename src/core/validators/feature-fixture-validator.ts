import { isFeatureFixtureContract, type FeatureFixtureContract } from '../features/feature-fixtures.js';
import { ValidationError } from './validation-error.js';

export function parseFeatureFixtureContract(value: unknown): FeatureFixtureContract {
  if (!isFeatureFixtureContract(value)) throw new ValidationError('sks.feature-fixture-contract.v1');
  return value;
}
