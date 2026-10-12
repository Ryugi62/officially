import type { AttestationReader, AttestationWriter, WriteBatch } from "../../src/application/ports"
import type { Address, EndpointClaim, Hex, Incident, ProjectRecord } from "../../src/domain/types"

export class FakeReader implements AttestationReader {
  calls: string[] = []
  constructor(
    public records: ProjectRecord[] = [],
    public claims: EndpointClaim[] = [],
    public incidents: Incident[] = [],
    public block = 100_000n,
  ) {}
  async findProjectRecords(rootKey: Address) {
    this.calls.push("findProjectRecords")
    return this.records.filter((r) => r.creator.toLowerCase() === rootKey.toLowerCase())
  }
  pageLimit = 200
  async findAttestations(targetHashes: Hex[], creators?: Address[]) {
    this.calls.push("findAttestations")
    const by = (a: Address) => !creators || creators.some((c) => c.toLowerCase() === a.toLowerCase())
    const items = [
      ...this.claims.filter((c) => targetHashes.includes(c.targetHash) && by(c.creator)),
      ...this.incidents.filter((i) => (targetHashes.includes(i.targetHash) || /^0x0{64}$/.test(i.targetHash)) && by(i.creator)),
    ].slice(0, this.pageLimit)
    return {
      claims: items.filter((x): x is EndpointClaim => x.entity === "endpoint"),
      incidents: items.filter((x): x is Incident => x.entity === "incident"),
      atBlock: this.block,
    }
  }
  async findClaimants(targetHashes: Hex[], limit: number) {
    this.calls.push("findClaimants")
    return this.claims.filter((c) => targetHashes.includes(c.targetHash)).slice(0, Math.min(limit, this.pageLimit))
  }
  async findClaimsByCreator(creator: Address) {
    this.calls.push("findClaimsByCreator")
    return this.claims.filter((c) => c.creator.toLowerCase() === creator.toLowerCase())
  }
  async currentBlock() {
    this.calls.push("currentBlock")
    return this.block
  }
}

export class FakeWriter implements AttestationWriter {
  batches: WriteBatch[] = []
  constructor(public address: Address) {}
  async predictKeys(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      key: ("0x" + "f".repeat(62) + i.toString(16).padStart(2, "0")) as Hex,
      salt: BigInt(1000 + i),
    }))
  }
  async submit(batch: WriteBatch) {
    this.batches.push(batch)
    return {
      txHash: ("0x" + "9".repeat(64)) as Hex,
      created: batch.creates.map((_, i) => ("0x" + "c".repeat(62) + i.toString(16).padStart(2, "0")) as Hex),
    }
  }
}
