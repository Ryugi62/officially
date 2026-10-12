import type { AttestationReader, AttestationWriter, WriteBatch } from "../../src/application/ports"
import type { Address, EndpointClaim, Hex, Incident, ProjectRecord } from "../../src/domain/types"

export class FakeReader implements AttestationReader {
  calls: string[] = []
  constructor(
    public records: ProjectRecord[] = [],
    public claims: EndpointClaim[] = [],
    public incidents: Incident[] = [],
    public block = 500n,
  ) {}
  async findProjectRecords(rootKey: Address) {
    this.calls.push("findProjectRecords")
    return this.records.filter((r) => r.creator.toLowerCase() === rootKey.toLowerCase())
  }
  async findAttestations(targetHash: Hex) {
    this.calls.push("findAttestations")
    return {
      claims: this.claims.filter((c) => c.targetHash === targetHash),
      incidents: this.incidents.filter((i) => i.targetHash === targetHash || /^0x0{64}$/.test(i.targetHash)),
    }
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
