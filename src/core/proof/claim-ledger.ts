export function summarizeClaims(claims: any = []) {
  const rows = Array.isArray(claims) ? claims : [];
  return {
    total: rows.length,
    supported: rows.filter((claim: any) => claim.status === 'supported').length,
    unverified: rows.filter((claim: any) => claim.status === 'unverified').length,
    blocked: rows.filter((claim: any) => claim.status === 'blocked').length
  };
}
