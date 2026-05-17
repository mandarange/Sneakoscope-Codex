export function summarizeClaims(claims = []) {
  const rows = Array.isArray(claims) ? claims : [];
  return {
    total: rows.length,
    supported: rows.filter((claim) => claim.status === 'supported').length,
    unverified: rows.filter((claim) => claim.status === 'unverified').length,
    blocked: rows.filter((claim) => claim.status === 'blocked').length
  };
}
