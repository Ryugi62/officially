// UC-1 CheckTarget, AC-13 read budget
import { describe, expect, it } from "vitest"
import { checkTarget } from "../../src/application/check-target"
import { hashTarget } from "../../src/domain/hash"
import { normalizeTarget } from "../../src/domain/target"
import { claim, EVIL, PUB_A, record, ROOT } from "../fixtures"
import { FakeReader } from "./fakes"

const URL = "https://app.demo-swap.example/swap?amount=1"
const H = hashTarget(normalizeTarget(URL))

describe("checkTarget (UC-1)", () => {
  it("returns OFFICIAL end to end through the reader port", async () => {
    const reader = new FakeReader([record({ publisher: PUB_A })], [claim({ targetHash: H, creator: PUB_A })])
    const v = await checkTarget(reader, { raw: URL, pin: { rootKey: ROOT } })
    expect(v.status).toBe("OFFICIAL")
    expect(v.target).toBe("https://app.demo-swap.example")
  })
  it("AC-13 performs at most 3 reader calls", async () => {
    const reader = new FakeReader([record({ publisher: PUB_A })], [claim({ targetHash: H, creator: EVIL })])
    await checkTarget(reader, { raw: URL, pin: { rootKey: ROOT } })
    expect(reader.calls.length).toBeLessThanOrEqual(3)
  })
  it("AC-13 skips the project lookup when nothing is pinned", async () => {
    const reader = new FakeReader([], [claim({ targetHash: H, creator: EVIL })])
    const v = await checkTarget(reader, { raw: URL })
    expect(v.status).toBe("UNPINNED")
    expect(reader.calls).not.toContain("findProjectRecords")
  })
  it("passes the chain id through for bare contract addresses", async () => {
    const reader = new FakeReader()
    const v = await checkTarget(reader, { raw: "0xAbCdEf0123456789abcdef0123456789ABCDEF01", chainId: 8453, pin: { rootKey: ROOT } })
    expect(v.target).toBe("eip155:8453:0xabcdef0123456789abcdef0123456789abcdef01")
  })
})
