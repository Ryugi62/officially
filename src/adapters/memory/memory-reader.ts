import type { AttestationReader } from "../../application/ports"
import { PROJECT_WIDE } from "../../domain/hash"
import type { Address, EndpointClaim, Hex, Incident, ProjectRecord } from "../../domain/types"

/** An AttestationReader over a fixed set of entities: the offline snapshot shown when the public RPC rate-limits, and local previews. */
export class MemoryReader implements AttestationReader {
  constructor(
    private readonly records: ProjectRecord[],
    private readonly claims: EndpointClaim[],
    private readonly incidents: Incident[],
    private readonly block: bigint,
  ) {}
  private by(creators?: Address[]) {
    const set = creators && new Set(creators.map((c) => c.toLowerCase()))
    return (a: Address) => !set || set.has(a.toLowerCase())
  }
  async findProjectRecords(rootKey: Address) {
    return this.records.filter((r) => r.creator.toLowerCase() === rootKey.toLowerCase() && r.expiresAtBlock > this.block)
  }
  async findAttestations(hashes: Hex[], creators?: Address[]) {
    const ok = this.by(creators)
    return {
      claims: this.claims.filter((c) => hashes.includes(c.targetHash) && ok(c.creator) && c.expiresAtBlock > this.block),
      incidents: this.incidents.filter((i) => (hashes.includes(i.targetHash) || i.targetHash === PROJECT_WIDE) && ok(i.creator) && i.expiresAtBlock > this.block),
      atBlock: this.block,
    }
  }
  async findClaimants(hashes: Hex[], limit: number) {
    return this.claims.filter((c) => hashes.includes(c.targetHash) && c.expiresAtBlock > this.block).slice(0, limit)
  }
  async findClaimsByCreator(creator: Address) {
    return this.claims.filter((c) => c.creator.toLowerCase() === creator.toLowerCase() && c.expiresAtBlock > this.block)
  }
  async listIncidentsBy(creators: Address[]) {
    const ok = this.by(creators)
    return this.incidents.filter((i) => ok(i.creator) && i.expiresAtBlock > this.block)
  }
  async findIncident(key: Hex) {
    return this.incidents.find((i) => i.key === key && i.expiresAtBlock > this.block)
  }
  async currentBlock() {
    return this.block
  }
}

type Json = Record<string, unknown>
const big = (o: Json, k: string) => BigInt(String(o[k]))
/** Snapshots are JSON (bigints as strings); this turns one back into a reader. */
export function readerFromSnapshot(s: { block: string; records: Json[]; claims: Json[]; incidents: Json[] }): MemoryReader {
  const fix = <T>(o: Json) => ({ ...o, createdAtBlock: big(o, "createdAtBlock"), expiresAtBlock: big(o, "expiresAtBlock") }) as T
  return new MemoryReader(s.records.map(fix<ProjectRecord>), s.claims.map(fix<EndpointClaim>), s.incidents.map(fix<Incident>), BigInt(s.block))
}
