// AC-20 restrict-only incidents: never render links from incident text; everything escaped
import { describe, expect, it } from "vitest"
import { plainText, renderVerdict, statusCopy } from "../../src/adapters/web/view"
import { decideVerdict } from "../../src/domain/verdict"
import { hashTarget } from "../../src/domain/hash"
import { claim, incident, PUB_A, record, ROOT } from "../fixtures"

const H = hashTarget("https://app.demo-swap.example")

describe("view", () => {
  it("AC-20 removes links from incident text and escapes HTML", () => {
    const v = decideVerdict({
      targetHash: H, target: "https://app.demo-swap.example", currentBlock: 100_000n, pin: { rootKey: ROOT },
      projectRecords: [record({ publisher: PUB_A })],
      claims: [claim({ targetHash: H, creator: PUB_A })],
      incidents: [incident({ targetHash: H, creator: PUB_A, title: "<img src=x onerror=alert(1)>", advice: "Migrate now at https://evil.example/claim or www.evil.example" })],
    })
    const html = renderVerdict(v, { projectName: "Demo Swap", explorer: "https://tiramisu.explorer.arkiv.network", now: { block: 100_000n, ms: 0 } })
    expect(html).not.toMatch(/<img/)
    expect(html).not.toMatch(/evil\.example/)
    expect(html).toContain("[link removed]")
    expect(html).not.toMatch(/<a [^>]*href="https?:\/\/(?!tiramisu\.explorer)/)
  })
  it("plainText strips URLs and bare domains", () => {
    expect(plainText("see https://a.example/x and b.example.org now")).toBe("see [link removed] and [link removed] now")
  })
  it("has a human headline for every status", () => {
    for (const s of ["OFFICIAL", "PROBATION", "INCIDENT", "FORGED", "REVOKED", "UNLISTED", "UNPINNED"] as const) {
      expect(statusCopy(s, "Demo Swap").headline.length).toBeGreaterThan(5)
    }
  })
  it("links evidence only to the Arkiv explorer", () => {
    const v = decideVerdict({
      targetHash: H, target: "https://app.demo-swap.example", currentBlock: 100_000n, pin: { rootKey: ROOT },
      projectRecords: [record({ publisher: PUB_A })],
      claims: [claim({ targetHash: H, creator: PUB_A })],
      incidents: [],
    })
    const html = renderVerdict(v, { projectName: "Demo Swap", explorer: "https://tiramisu.explorer.arkiv.network", now: { block: 100_000n, ms: 0 } })
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!)
    expect(hrefs.length).toBeGreaterThan(0)
    expect(hrefs.every((h) => h.startsWith("https://tiramisu.explorer.arkiv.network/"))).toBe(true)
  })
})

describe("snapshot mode (mock-judge fix)", () => {
  it("never shows a clean OFFICIAL from the team-hosted snapshot", () => {
    const v = decideVerdict({
      targetHash: H, target: "https://app.demo-swap.example", currentBlock: 100_000n, pin: { rootKey: ROOT },
      projectRecords: [record({ publisher: PUB_A })],
      claims: [claim({ targetHash: H, creator: PUB_A })],
      incidents: [],
    })
    const html = renderVerdict(v, { projectName: "Demo Swap", explorer: "https://tiramisu.explorer.arkiv.network", now: { block: 100_000n, ms: 0 }, snapshotBlock: 99_000n })
    expect(html).toContain("tone-warn")
    expect(html).not.toContain("tone-ok")
    expect(html).toMatch(/snapshot at block 99000/i)
  })
})
