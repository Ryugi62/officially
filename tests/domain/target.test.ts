// AC-1 normalize
import { describe, expect, it } from "vitest"
import { normalizeTarget, InvalidTargetError } from "../../src/domain/target"

describe("normalizeTarget (AC-1)", () => {
  it("keeps only the lowercase origin of a web URL", () => {
    expect(normalizeTarget("HTTPS://App.Example.org/swap?x=1#y")).toEqual({ kind: "web", value: "https://app.example.org" })
  })
  it("drops the default port but keeps a custom one", () => {
    expect(normalizeTarget("https://example.org:443/a").value).toBe("https://example.org")
    expect(normalizeTarget("https://example.org:8443/a").value).toBe("https://example.org:8443")
  })
  it("treats a bare domain as https", () => {
    expect(normalizeTarget("app.example.org").value).toBe("https://app.example.org")
  })
  it("keeps punycode distinct from its look-alike (no silent unicode folding)", () => {
    const a = normalizeTarget("https://curve.fi").value
    const b = normalizeTarget("https://сurve.fi").value // Cyrillic 'с'
    expect(a).not.toBe(b)
    expect(b.startsWith("https://xn--")).toBe(true)
  })
  it("normalizes a contract address with its chain", () => {
    expect(normalizeTarget("0xAbCdEf0123456789abcdef0123456789ABCDEF01", { chainId: 1 })).toEqual({
      kind: "contract",
      value: "eip155:1:0xabcdef0123456789abcdef0123456789abcdef01",
    })
  })
  it("requires a chain for a bare address", () => {
    expect(() => normalizeTarget("0xAbCdEf0123456789abcdef0123456789ABCDEF01")).toThrow(InvalidTargetError)
  })
  it("accepts an explicit CAIP-10 address", () => {
    expect(normalizeTarget("eip155:8453:0xAbCdEf0123456789abcdef0123456789ABCDEF01").value).toBe(
      "eip155:8453:0xabcdef0123456789abcdef0123456789abcdef01",
    )
  })
  it("normalizes X handles from @name and profile URLs", () => {
    expect(normalizeTarget("@CurveFinance")).toEqual({ kind: "social", value: "x:@curvefinance" })
    expect(normalizeTarget("https://x.com/CurveFinance/status/1").value).toBe("x:@curvefinance")
    expect(normalizeTarget("https://twitter.com/CurveFinance").value).toBe("x:@curvefinance")
  })
  it("rejects empty and non-http schemes", () => {
    expect(() => normalizeTarget("   ")).toThrow(InvalidTargetError)
    expect(() => normalizeTarget("javascript:alert(1)")).toThrow(InvalidTargetError)
    expect(() => normalizeTarget("ftp://example.org")).toThrow(InvalidTargetError)
  })
})
