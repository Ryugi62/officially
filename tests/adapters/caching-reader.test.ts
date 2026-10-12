// The anonymous RPC budget is ~100 queries per IP per window: repeated checks must not re-query.
import { describe, expect, it } from "vitest"
import { CachingReader } from "../../src/adapters/memory/caching-reader"
import { checkTransaction } from "../../src/application/check-transaction"
import { hashTarget } from "../../src/domain/hash"
import { claim, PUB_A, record, ROOT } from "../fixtures"
import { FakeReader } from "../application/fakes"

const H = hashTarget("https://app.demo-swap.example")

describe("CachingReader", () => {
  it("serves repeated identical reads from cache within the TTL window and refetches after it", async () => {
    let now = 0
    const inner = new FakeReader([record({ publisher: PUB_A })], [claim({ targetHash: H, creator: PUB_A })])
    const r = new CachingReader(inner, { recordsMs: 300_000, attestationsMs: 20_000, now: () => now })
    await r.findProjectRecords(ROOT)
    await r.findAttestations([H], [PUB_A])
    await r.findProjectRecords(ROOT)
    await r.findAttestations([H], [PUB_A])
    expect(inner.calls).toEqual(["findProjectRecords", "findAttestations"])
    now = 21_000
    await r.findAttestations([H], [PUB_A])
    await r.findProjectRecords(ROOT)
    expect(inner.calls).toEqual(["findProjectRecords", "findAttestations", "findAttestations"])
  })
  it("keys the cache by the exact hashes and creators", async () => {
    const inner = new FakeReader()
    const r = new CachingReader(inner, { now: () => 0 })
    await r.findAttestations([H], [PUB_A])
    await r.findAttestations([H], [ROOT])
    expect(inner.calls.length).toBe(2)
  })
  it("toggling the demo between two transactions costs reads only the first time each", async () => {
    const inner = new FakeReader([record({ publisher: PUB_A })], [])
    const r = new CachingReader(inner, { now: () => 0 })
    const tx = (spender: string) => ({ request: { to: "0x00000000000000000000000000000000000000aa", data: "0x095ea7b3" + spender.slice(2).padStart(64, "0") + "f".repeat(64), chainId: 1 }, origin: "https://app.demo-swap.example", pin: { rootKey: ROOT } })
    for (let i = 0; i < 3; i++) {
      await checkTransaction(r, tx("0x00000000000000000000000000000000000000b1"))
      await checkTransaction(r, tx("0x00000000000000000000000000000000000000b2"))
    }
    expect(inner.calls.length).toBe(5) // records once + (attestations + claimants) × 2 distinct transactions
  })
  it("does not cache failures", async () => {
    let fail = true
    const inner = new FakeReader()
    const orig = inner.findProjectRecords.bind(inner)
    inner.findProjectRecords = async (a) => { if (fail) throw new Error("429"); return orig(a) }
    const r = new CachingReader(inner, { now: () => 0 })
    await expect(r.findProjectRecords(ROOT)).rejects.toThrow("429")
    fail = false
    await expect(r.findProjectRecords(ROOT)).resolves.toEqual([])
  })
})

describe("CachingReader.invalidateAttestations", () => {
  it("forces the next attestation read but keeps project records", async () => {
    const inner = new FakeReader()
    const r = new CachingReader(inner, { now: () => 0 })
    await r.findProjectRecords(ROOT); await r.findAttestations([H])
    r.invalidateAttestations()
    await r.findProjectRecords(ROOT); await r.findAttestations([H])
    expect(inner.calls).toEqual(["findProjectRecords", "findAttestations", "findAttestations"])
  })
})
