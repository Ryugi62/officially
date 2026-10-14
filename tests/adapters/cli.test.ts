import { describe, expect, it } from "vitest"
import { parseArgs, exitCodeFor } from "../../src/adapters/cli/args"

describe("CLI args", () => {
  it("parses check with root and chain", () => {
    expect(parseArgs(["check", "0xabc", "--root", "0x11", "--chain", "8453", "--json"])).toEqual({
      cmd: "check", positional: ["0xabc"], flags: { root: "0x11", chain: "8453", json: true }, multi: {},
    })
  })
  it("collects repeated --endpoint flags", () => {
    const a = parseArgs(["publish", "--slug", "demo", "--endpoint", "https://a.example|App", "--endpoint", "@demo|X"])
    expect(a.multi.endpoint).toEqual(["https://a.example|App", "@demo|X"])
  })
  it("exit code: 0 only when official", () => {
    expect(exitCodeFor("OFFICIAL")).toBe(0)
    for (const s of ["PROBATION", "INCIDENT", "FORGED", "REVOKED", "UNLISTED", "UNPINNED", "UNVERIFIED_KEY"] as const) expect(exitCodeFor(s)).toBe(1)
  })
  it("rejects an unknown command", () => {
    expect(() => parseArgs(["frobnicate"])).toThrow(/Unknown command/)
  })
})
