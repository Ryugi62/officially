// Unit 1 (anchor independence): the verdict shows where the anchor lives and whether that is the tool's own repo; ENS text records are anchors too.
import { describe, expect, it } from "vitest"
import { anchorOrigin, anchorUrl, applyAnchor, evaluateAnchors, TOOL_REPO } from "../../src/domain/anchor"
import { EnsAnchorFetcher, RoutingAnchorFetcher } from "../../src/adapters/anchor/ens-fetcher"
import { confirmRootKey } from "../../src/application/confirm-root"
import { decideVerdict } from "../../src/domain/verdict"
import { hashTarget } from "../../src/domain/hash"
import { normalizeTarget } from "../../src/domain/target"
import { claim, record, ROOT, PUB_A, EVIL } from "../fixtures"

const SITE = "https://raw.githubusercontent.com/Ryugi62/demo-swap-site/main/.well-known/officially.json"
const TOOL = "https://raw.githubusercontent.com/Ryugi62/officially/main/demo/.well-known/officially.json"
const DOC = (r: string) => JSON.stringify({ officially: { rootKey: r } })

describe("anchorOrigin", () => {
  it("a different GitHub repo than the tool's is independent", () => {
    const o = anchorOrigin(SITE)
    expect(o.independent).toBe(true)
    expect(o.label).toBe("github.com/Ryugi62/demo-swap-site")
  })
  it("the tool's own repo is NOT independent", () => {
    expect(TOOL_REPO).toBe("Ryugi62/officially")
    expect(anchorOrigin(TOOL).independent).toBe(false)
  })
  it("an ENS name and a project's own https host are independent of the tool", () => {
    expect(anchorOrigin("ens:demo-swap.eth")).toEqual({ label: "ens:demo-swap.eth", independent: true })
    expect(anchorOrigin("https://demo-swap.example/.well-known/officially.json").independent).toBe(true)
  })
})

describe("verdict text shows the anchor origin", () => {
  const T = normalizeTarget("https://app.demo-swap.example")
  const official = () => decideVerdict({
    targetHash: hashTarget(T), target: T.value, currentBlock: 200_000n, pin: { rootKey: ROOT },
    projectRecords: [record({ publisher: PUB_A })], claims: [claim({ targetHash: hashTarget(T), creator: PUB_A, createdAtBlock: 1n })], incidents: [],
  })
  it("independent anchor: 'anchor origin ≠ tool repo'", () => {
    const v = applyAnchor(official(), evaluateAnchors(ROOT, [{ source: SITE, text: DOC(ROOT) }]))
    expect(v.reasons.join("\n")).toContain("anchor origin github.com/Ryugi62/demo-swap-site ≠ tool repo Ryugi62/officially")
  })
  it("tool-repo anchor: says it is the same repo", () => {
    const v = applyAnchor(official(), evaluateAnchors(ROOT, [{ source: TOOL, text: DOC(ROOT) }]))
    expect(v.reasons.join("\n")).toContain("same repo as the tool")
  })
})

describe("ens anchors", () => {
  it("anchorUrl passes ens:<name> through untouched", () => {
    expect(anchorUrl("ens:demo-swap.eth")).toBe("ens:demo-swap.eth")
  })
  it("EnsAnchorFetcher reads the officially.rootKey text record through a resolver port", async () => {
    const asked: Array<[string, string]> = []
    const f = new EnsAnchorFetcher({ async text(n, k) { asked.push([n, k]); return ROOT } })
    const text = await f.fetchText("ens:demo-swap.eth")
    expect(asked).toEqual([["demo-swap.eth", "officially.rootKey"]])
    expect((await confirmRootKey(f, ROOT, ["ens:demo-swap.eth"])).state).toBe("CONFIRMED")
    expect(text).toContain(ROOT)
  })
  it("a record naming another key is MISMATCH; no record is ABSENT; a resolver error is never CONFIRMED", async () => {
    expect((await confirmRootKey(new EnsAnchorFetcher({ text: async () => EVIL }), ROOT, ["ens:x.eth"])).state).toBe("MISMATCH")
    expect((await confirmRootKey(new EnsAnchorFetcher({ text: async () => null }), ROOT, ["ens:x.eth"])).state).toBe("ABSENT")
    expect((await confirmRootKey(new EnsAnchorFetcher({ text: async () => { throw new Error("rpc") } }), ROOT, ["ens:x.eth"])).state).toBe("ABSENT")
  })
  it("junk in the record is not an anchor", async () => {
    expect((await confirmRootKey(new EnsAnchorFetcher({ text: async () => "<script>" }), ROOT, ["ens:x.eth"])).state).toBe("ABSENT")
  })
  it("RoutingAnchorFetcher sends ens: to ENS and https: to HTTP", async () => {
    const r = new RoutingAnchorFetcher(new EnsAnchorFetcher({ text: async () => ROOT }), { fetchText: async (u) => (u === SITE ? DOC(ROOT) : undefined) })
    expect((await confirmRootKey(r, ROOT, ["ens:a.eth", SITE])).confirmedBy).toEqual(["ens:a.eth", SITE])
  })
})
