import { ReadTimeoutError } from "../arkiv/reader"

/** A public-RPC limit as the page sees it: a read timeout, or a viem "HTTP request failed … Status: 429" (its message carries the status, not the word "rate"). */
export function isRateLimit(e: unknown): boolean {
  if (e instanceof ReadTimeoutError) return true
  const m = String((e as Error)?.message ?? e)
  return /\b429\b|too many requests|rate.?limit|failed to fetch|timed? ?out/i.test(m) || (e as { status?: number })?.status === 429
}
