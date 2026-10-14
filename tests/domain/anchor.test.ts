// Unit 1 (TOFU): the root key a first-time user pins is confirmed by an anchor outside Arkiv.
import { describe, expect, it } from "vitest"
import { applyAnchor, anchorUrl, evaluateAnchors, parseAnchorDoc } from "../../src/domain/anchor"
import { confirmRootKey } from "../../src/application/confirm-root"
import { decideVerdict } from "../../src/domain/verdict"
import { claim, record, ROOT, PUB_A, EVIL } from "../fixtures"
import { hashTarget } from "../../src/domain/hash"
import { normalizeTarget } from "../../src/domain/target"

const DOC = (root: string) => JSON.stringify({ project: "Demo", officially: { contract: "officially.v1", rootKey: root } })
const URL1 = "https://raw.githubusercontent.com/Ryugi62/officially/main/demo/.well-known/officially.json"

describe("anchor documents", () => {
  it("reads the root key from officially.rootKey, case-insensitively", () => {
    expect(parseAnchorDoc(DOC(ROOT.toUpperCase().replace("0X", "0x")))).toBe(ROOT)
  })
  it("returns undefined for junk, missing or malformed keys", () => {
    expect(parseAnchorDoc("not json")).toBeUndefined()
    expect(parseAnchorDoc(JSON.stringify({ officially: { rootKey: "0x12" } }))).toBeUndefined()
    expect(parseAnchorDoc(JSON.stringify({}))).toBeUndefined()
  })
  it("expands github:owner/repo/path to a raw https URL and refuses plain http", () => {
    expect(anchorUrl("github:Ryugi62/officially/demo/.well-known/officially.json")).toBe(URL1)
    expect(() => anchorUrl("http://example.org/x.json")).toThrow(/https/)
    expect(anchorUrl("https://example.org/.well-known/officially.json")).toBe("https://example.org/.well-known/officially.json")
  })
})

describe("evaluateAnchors", () => {
  it("CONFIRMED when at least one anchor states the same root key", () => {
    const e = evaluateAnchors(ROOT, [{ source: URL1, text: DOC(ROOT) }])
    expect(e.state).toBe("CONFIRMED")
    expect(e.confirmedBy).toEqual([URL1])
  })
  it("MISMATCH when the anchor names another key — even if another anchor is absent", () => {
    const e = evaluateAnchors(ROOT, [{ source: URL1, text: DOC(EVIL) }, { source: "https://b.example/x", text: undefined }])
    expect(e.state).toBe("MISMATCH")
    expect(e.reasons.join(" ")).toContain(EVIL)
  })
  it("a mismatch beats a confirmation (one lying anchor is a red flag, not a tie-break)", () => {
    const e = evaluateAnchors(ROOT, [{ source: URL1, text: DOC(ROOT) }, { source: "https://b.example/x", text: DOC(EVIL) }])
    expect(e.state).toBe("MISMATCH")
  })
  it("ABSENT when no anchor could be read, and when none was given", () => {
    expect(evaluateAnchors(ROOT, [{ source: URL1, text: undefined }]).state).toBe("ABSENT")
    expect(evaluateAnchors(ROOT, []).state).toBe("ABSENT")
  })
})

describe("applyAnchor", () => {
  const T = normalizeTarget("https://app.demo-swap.example")
  const official = () =>
    decideVerdict({
      targetHash: hashTarget(T), target: T.value, currentBlock: 200_000n, pin: { rootKey: ROOT },
      projectRecords: [record({ publisher: PUB_A })],
      claims: [claim({ targetHash: hashTarget(T), creator: PUB_A, createdAtBlock: 1n })], incidents: [],
    })
  it("keeps OFFICIAL and adds 'key confirmed by anchor: <source>' when confirmed", () => {
    expect(official().status).toBe("OFFICIAL")
    const v = applyAnchor(official(), evaluateAnchors(ROOT, [{ source: URL1, text: DOC(ROOT) }]))
    expect(v.status).toBe("OFFICIAL")
    expect(v.reasons.join("\n")).toContain(`key confirmed by anchor: ${URL1}`)
  })
  it("turns OFFICIAL into UNVERIFIED_KEY on mismatch or absence", () => {
    for (const docs of [[{ source: URL1, text: DOC(EVIL) }], [{ source: URL1, text: undefined }]]) {
      expect(applyAnchor(official(), evaluateAnchors(ROOT, docs)).status).toBe("UNVERIFIED_KEY")
    }
  })
  it("also demotes PROBATION; leaves worse verdicts (INCIDENT, FORGED) untouched", () => {
    const prob = { ...official(), status: "PROBATION" as const }
    expect(applyAnchor(prob, evaluateAnchors(ROOT, [])).status).toBe("UNVERIFIED_KEY")
    const forged = { ...official(), status: "FORGED" as const }
    expect(applyAnchor(forged, evaluateAnchors(ROOT, [])).status).toBe("FORGED")
  })
})

describe("confirmRootKey (application, fake fetcher)", () => {
  it("fetches each anchor once and survives a fetcher that throws", async () => {
    const calls: string[] = []
    const fetcher = {
      async fetchText(u: string) {
        calls.push(u)
        if (u.includes("bad")) throw new Error("boom")
        return DOC(ROOT)
      },
    }
    const e = await confirmRootKey(fetcher, ROOT, [URL1, "https://bad.example/x"])
    expect(calls).toHaveLength(2)
    expect(e.state).toBe("CONFIRMED")
  })
})

import { anchorGateTransaction } from "../../src/application/confirm-root"
describe("anchorGateTransaction", () => {
  it("re-derives the worst verdict after demoting parts, keeping INCIDENT worse than UNVERIFIED_KEY", () => {
    const part = (status: "OFFICIAL" | "INCIDENT") => ({ role: "origin" as const, target: "t", verdict: { status, targetHash: "0x00" as `0x${string}`, claimants: [], untrustedClaimants: [], unverifiedWarnings: [], reasons: [] } })
    const tv = { verdict: part("OFFICIAL").verdict, parts: [part("OFFICIAL")], undecoded: false }
    const out = anchorGateTransaction(tv, evaluateAnchors(ROOT, []))
    expect(out.verdict.status).toBe("UNVERIFIED_KEY")
    const tv2 = { verdict: part("INCIDENT").verdict, parts: [part("OFFICIAL"), part("INCIDENT")], undecoded: false }
    expect(anchorGateTransaction(tv2, evaluateAnchors(ROOT, [])).verdict.status).toBe("INCIDENT")
  })
})
