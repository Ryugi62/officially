import type { AttestationReader } from "../../application/ports"
import type { Address, Hex } from "../../domain/types"

/**
 * Wraps any reader so repeated identical reads are free for a while. The anonymous Arkiv RPC budget is
 * 600 cost units per minute and 10,000 per longer window per IP (one arkiv_query = 100), so a judge
 * clicking the demo back and forth must not re-query. Project records change rarely (5 min); attestations
 * can change any block, so they are kept 20 s. Failures are never cached.
 */
export class CachingReader implements AttestationReader {
  private cache = new Map<string, { at: number; value: Promise<unknown> }>()
  private readonly recordsMs: number
  private readonly attestationsMs: number
  private readonly now: () => number
  constructor(private readonly inner: AttestationReader, opts: { recordsMs?: number; attestationsMs?: number; now?: () => number } = {}) {
    this.recordsMs = opts.recordsMs ?? 300_000
    this.attestationsMs = opts.attestationsMs ?? 20_000
    this.now = opts.now ?? Date.now
  }
  private memo<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key)
    if (hit && this.now() - hit.at < ttl) return hit.value as Promise<T>
    const value = load()
    this.cache.set(key, { at: this.now(), value })
    value.catch(() => this.cache.delete(key))
    return value
  }
  private k = (xs: string[] | undefined) => (xs ?? []).map((x) => x.toLowerCase()).sort().join(",")
  /** Drop cached attestations (keep project records): called when the live feed reports a new incident. */
  invalidateAttestations() {
    for (const k of [...this.cache.keys()]) if (!k.startsWith("r:")) this.cache.delete(k)
  }
  findProjectRecords(rootKey: Address) {
    return this.memo(`r:${rootKey.toLowerCase()}`, this.recordsMs, () => this.inner.findProjectRecords(rootKey))
  }
  findAttestations(targetHashes: Hex[], creators?: Address[]) {
    return this.memo(`a:${this.k(targetHashes)}|${creators ? this.k(creators) : "*"}`, this.attestationsMs, () => this.inner.findAttestations(targetHashes, creators))
  }
  findClaimants(targetHashes: Hex[], limit: number) {
    return this.memo(`c:${this.k(targetHashes)}|${limit}`, this.attestationsMs, () => this.inner.findClaimants(targetHashes, limit))
  }
  findClaimsByCreator(creator: Address) {
    return this.inner.findClaimsByCreator(creator)
  }
  currentBlock() {
    return this.memo("b", 2_000, () => this.inner.currentBlock())
  }
}
