import { describe, expect, it } from "vitest"
import { isRateLimit } from "../../src/adapters/web/rate-limit"
import { ReadTimeoutError } from "../../src/adapters/arkiv/reader"
import { txHeadline, snapshotHeadline } from "../../src/adapters/web/view"

describe("isRateLimit", () => {
  it("recognises a viem 429 whose message is the long HTTP-request-failed text", () => {
    expect(isRateLimit(new Error("HTTP request failed.\n\nStatus: 429\nURL: https://x"))).toBe(true)
    expect(isRateLimit(new Error("Too Many Requests"))).toBe(true)
  })
  it("treats a read timeout as a limit", () => expect(isRateLimit(new ReadTimeoutError("read", 1000))).toBe(true))
  it("does not swallow unrelated errors", () => expect(isRateLimit(new Error("invalid address"))).toBe(false))
})
describe("snapshot headline", () => {
  it("says the signing verdict is on hold instead of 'Safe to sign'", () => {
    const h = snapshotHeadline()
    expect(h.text).toBe("RPC limit — snapshot shown, signing verdict on hold")
    expect(h.tone).toBe("warn")
    expect(txHeadline({ verdict: { status: "OFFICIAL" }, parts: [], undecoded: false }, "X").text).toContain("Safe to sign")
  })
})
