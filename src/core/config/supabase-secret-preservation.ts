export const PROTECTED_SUPABASE_ENV_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'PUBLIC_SUPABASE_URL',
  'PUBLIC_SUPABASE_ANON_KEY'
] as const;

export const PROTECTED_SUPABASE_CONFIG_PATHS = [
  'supabase.url',
  'supabase.anon_key',
  'supabase.service_role_key',
  'mcp.supabase.url',
  'mcp.supabase.token',
  'mcp.supabase.access_token',
  'mcp.supabase.service_role_key'
] as const;

export const PROTECTED_SECRET_KEYS = [
  ...PROTECTED_SUPABASE_ENV_KEYS,
  ...PROTECTED_SUPABASE_CONFIG_PATHS
] as const;

export function isProtectedSecretKey(key: string): boolean {
  const normalized = String(key || '').trim();
  return PROTECTED_SECRET_KEYS.some((candidate) => candidate === normalized);
}
