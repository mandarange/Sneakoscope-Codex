export type FeatureQuality =
  | 'runtime_verified'
  | 'wiring_only'
  | 'integration_optional'
  | 'static_contract'
  | 'missing';

export interface FeatureFixtureContract {
  id: string;
  quality: FeatureQuality;
  command: string | null;
  expected_artifacts: readonly unknown[];
}

export function isFeatureFixtureContract(value: unknown): value is FeatureFixtureContract {
  if (!value || typeof value !== 'object') return false;
  const fixture = value as Partial<FeatureFixtureContract>;
  return typeof fixture.id === 'string'
    && typeof fixture.quality === 'string'
    && (fixture.command === null || typeof fixture.command === 'string')
    && Array.isArray(fixture.expected_artifacts);
}
