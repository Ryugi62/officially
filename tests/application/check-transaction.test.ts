// UC-9, AC-19 (Curve-2022 shape), AC-21 (trusted-first reads)
import { describe, expect, it } from "vitest"
import { encodeFunctionData, parseAbi } from "viem"
import { checkTransaction } from "../../src/application/check-transaction"
import { checkTarget } from "../../src/application/check-target"
import { hashTarget } from "../../src/domain/hash"
import { normalizeTarget } from "../../src/domain/target"
import { claim, EVIL, PUB_A, record, ROOT } from "../fixtures"
import { FakeReader } from "./fakes"

const ORIGIN = "https://app.demo-swap.example"
const TOKEN = "0x00000000000000000000000000000000000000aa"
const ROUTER = "0x00000000000000000000000000000000000000a1"
const DRAINER = "0x00000000000000000000000000000000000000d0"
const h = (raw: string) => hashTarget(normalizeTarget(raw, { chainId: 1 }))
const approve = (spender: string) =>
  encodeFunctionData({ abi: parseAbi(["function approve(address,uint256)"]), functionName: "approve", args: [spender as `0x${string}`, 2n ** 255n] })

function project() {
  const old = 1n
  return new FakeReader(
    [record({ publisher: PUB_A })],
    [
      claim({ targetHash: h(ORIGIN), creator: PUB_A, createdAtBlock: old }),
      claim({ targetHash: h(`eip155:1:${TOKEN}`), creator: PUB_A, createdAtBlock: old }),
      claim({ targetHash: h(`eip155:1:${ROUTER}`), creator: PUB_A, createdAtBlock: old }),
    ],
    [],
    200_000n,
  )
}

describe("checkTransaction (UC-9)", () => {
  it("passes approve(router) on the official origin", async () => {
    const r = await checkTransaction(project(), { request: { to: TOKEN, data: approve(ROUTER), chainId: 1 }, origin: ORIGIN, pin: { rootKey: ROOT } })
    expect(r.verdict.status).toBe("OFFICIAL")
    expect(r.parts.map((p) => p.role)).toEqual(["origin", "contract", "spender"])
  })
  it("AC-19 Curve-2022 shape: official origin + official token + unpublished spender → not OFFICIAL", async () => {
    const r = await checkTransaction(project(), { request: { to: TOKEN, data: approve(DRAINER), chainId: 1 }, origin: ORIGIN, pin: { rootKey: ROOT } })
    expect(["UNLISTED", "FORGED"]).toContain(r.verdict.status)
    expect(r.parts.find((p) => p.role === "spender")!.verdict.status).toBe("UNLISTED")
    expect(r.parts.find((p) => p.role === "origin")!.verdict.status).toBe("OFFICIAL")
  })
  it("a drainer the attacker 'published' under the project's name is FORGED", async () => {
    const reader = project()
    reader.claims.push(claim({ targetHash: h(`eip155:1:${DRAINER}`), creator: EVIL, projectSlug: "demo-swap", createdAtBlock: 1n }))
    const r = await checkTransaction(reader, { request: { to: TOKEN, data: approve(DRAINER), chainId: 1 }, origin: ORIGIN, pin: { rootKey: ROOT } })
    expect(r.verdict.status).toBe("FORGED")
  })
  it("AC-13 a whole transaction costs at most 3 reads", async () => {
    const reader = project()
    await checkTransaction(reader, { request: { to: TOKEN, data: approve(ROUTER), chainId: 1 }, origin: ORIGIN, pin: { rootKey: ROOT } })
    expect(reader.calls.length).toBeLessThanOrEqual(3)
  })
})

describe("trusted-first reads (AC-21)", () => {
  it("250 spam claims by another key cannot push the trusted claim out of a 200-result page", async () => {
    const reader = project()
    for (let i = 0; i < 250; i++) reader.claims.unshift(claim({ targetHash: h(ORIGIN), creator: EVIL, createdAtBlock: 1n }))
    reader.pageLimit = 200
    const v = await checkTarget(reader, { raw: ORIGIN, pin: { rootKey: ROOT } })
    expect(v.status).toBe("OFFICIAL")
    expect(v.untrustedClaimants).toContain(EVIL)
  })
})

describe("undecoded calldata (mock-judge fix)", () => {
  it("an official contract called with calldata we cannot read is flagged undecoded, so it is never a clean pass", async () => {
    const multicall = "0xac9650d8" + "00".repeat(64)
    const r = await checkTransaction(project(), { request: { to: ROUTER, data: multicall, chainId: 1 }, origin: ORIGIN, pin: { rootKey: ROOT } })
    expect(r.verdict.status).toBe("OFFICIAL")
    expect(r.undecoded).toBe(true)
  })
  it("decoded approvals and plain calls without data are not flagged", async () => {
    const a = await checkTransaction(project(), { request: { to: TOKEN, data: approve(ROUTER), chainId: 1 }, origin: ORIGIN, pin: { rootKey: ROOT } })
    const b = await checkTransaction(project(), { request: { to: ROUTER, chainId: 1 }, origin: ORIGIN, pin: { rootKey: ROOT } })
    expect([a.undecoded, b.undecoded]).toEqual([false, false])
  })
})
