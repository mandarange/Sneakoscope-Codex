import { type FeatureFixtureContract } from './feature-fixtures.js';

export const FEATURE_REGISTRY_SCHEMA = 'sks.feature-registry.v1' as const;

export interface FeatureRecord {
  id: string;
  surface: 'cli' | 'route' | 'skill' | 'handler' | 'proof';
  fixture: FeatureFixtureContract;
}

export interface FeatureRegistry {
  schema: typeof FEATURE_REGISTRY_SCHEMA;
  generated_at: string;
  features: FeatureRecord[];
}
