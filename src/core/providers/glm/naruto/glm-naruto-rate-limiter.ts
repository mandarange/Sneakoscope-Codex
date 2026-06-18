export interface RateLimitState {
  readonly rateLimited: boolean;
  readonly retryAfterMs: number;
  readonly consecutive429: number;
  readonly last429At: number | null;
}

export function createRateLimitState(): RateLimitState {
  return { rateLimited: false, retryAfterMs: 0, consecutive429: 0, last429At: null };
}

export function handleRateLimit(state: RateLimitState, retryAfterMs: number): RateLimitState {
  return {
    rateLimited: true,
    retryAfterMs,
    consecutive429: state.consecutive429 + 1,
    last429At: Date.now()
  };
}

export function clearRateLimit(state: RateLimitState): RateLimitState {
  return { rateLimited: false, retryAfterMs: 0, consecutive429: 0, last429At: state.last429At };
}

export function shouldBackoff(state: RateLimitState): boolean {
  return state.consecutive429 > 3 || (state.last429At !== null && Date.now() - state.last429At < state.retryAfterMs);
}
