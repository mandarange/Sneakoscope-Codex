export function parsePort(value, fallback = 3000) {
  const parsed = Number(value);
  return parsed || fallback;
}
