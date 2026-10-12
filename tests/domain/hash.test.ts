// AC-2 hash
import { describe, expect, it } from "vitest"
import { keccak256, toBytes } from "viem"
import { hashTarget, PROJECT_WIDE } from "../../src/domain/hash"
import { normalizeTarget } from "../../src/domain/target"

describe("hashTarget (AC-2)", () => {
  it("is stable for the same target", () => {
    const t = normalizeTarget("https://app.example.org/x")
    expect(hashTarget(t)).toBe(hashTarget(normalizeTarget("HTTPS://APP.example.org")))
  })
  it("differs for different targets", () => {
    expect(hashTarget(normalizeTarget("https://a.example.org"))).not.toBe(hashTarget(normalizeTarget("https://b.example.org")))
  })
  it("matches keccak256(utf8(value)) as computed by viem (contract)", () => {
    const t = normalizeTarget("https://app.example.org")
    expect(hashTarget(t)).toBe(keccak256(toBytes("https://app.example.org")))
  })
  it("is a 0x-prefixed 32-byte hex string, and never the project-wide sentinel", () => {
    const h = hashTarget(normalizeTarget("https://app.example.org"))
    expect(h).toMatch(/^0x[0-9a-f]{64}$/)
    expect(h).not.toBe(PROJECT_WIDE)
    expect(PROJECT_WIDE).toBe("0x" + "0".repeat(64))
  })
})
