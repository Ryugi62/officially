// Unit 1 (anchor bootstrap): the anchor list comes from the root-signed project record or a value the user pinned earlier — never from the page.
import { describe, expect, it } from "vitest"
import { recordAnchorUrl, selectAnchors } from "../../src/domain/anchor-sources"
import { evaluateAnchors, applyAnchor } from "../../src/domain/anchor"
import { confirmRootKey } from "../../src/application/confirm-root"
import { decideVerdict } from "../../src/domain/verdict"
import { claim, record, ROOT, PUB_A, EVIL } from "../fixtures"
import { hashTarget } from "../../src/domain/hash"
import { normalizeTarget } from "../../src/domain/target"

const GOOD = "https://raw.githubusercontent.com/Ryugi62/demo-swap-site/main/.well-known/officially.json"
const ATTACKER = "https://raw.githubusercontent.com/attacker/phish/main/.well-known/officially.json"
const DOC = (k: string) => JSON.stringify({ officially: { rootKey: k } })

describe("recordAnchorUrl", () => {
  it("turns a GitHub blob link, github: ref, ens: and https refs into the fetch location", () => {
    expect(recordAnchorUrl({ kind: "github", ref: "https://github.com/Ryugi62/demo-swap-site/blob/main/.well-known/officially.json" })).toBe(GOOD)
    expect(recordAnchorUrl({ kind: "github", ref: "github:Ryugi62/demo-swap-site/.well-known/officially.json" })).toBe(GOOD)
    expect(recordAnchorUrl({ kind: "ens", ref: "ens:demo.eth" })).toBe("ens:demo.eth")
    expect(recordAnchorUrl({ kind: "well-known", ref: "https://demo.example/.well-known/officially.json" })).toBe("https://demo.example/.well-known/officially.json")
  })
  it("returns undefined for plain http or junk", () => {
    expect(recordAnchorUrl({ kind: "well-known", ref: "http://demo.example/x" })).toBeUndefined()
    expect(recordAnchorUrl({ kind: "github", ref: "not a ref" })).toBeUndefined()
  })
})

describe("selectAnchors", () => {
  const rec = record({ publisher: PUB_A, anchors: [{ kind: "github", ref: "github:Ryugi62/demo-swap-site/.well-known/officially.json" }] })
  it("uses the record's anchors when the root was pinned", () => {
    expect(selectAnchors({ rootFrom: "pinned", records: [rec], pinned: [], supplied: [], fromPage: [] }).refs).toEqual([GOOD])
  })
  it("ignores every anchor that came from the page, and says so", () => {
    const s = selectAnchors({ rootFrom: "pinned", records: [rec], pinned: [], supplied: [], fromPage: [ATTACKER] })
    expect(s.refs).toEqual([GOOD])
    expect(s.ignored).toEqual([{ ref: ATTACKER, reason: expect.stringContaining("page") }])
  })
  it("a page anchor that equals a record anchor is still the record's, not the page's", () => {
    const s = selectAnchors({ rootFrom: "pinned", records: [rec], pinned: [], supplied: [], fromPage: [GOOD] })
    expect(s.refs).toEqual([GOOD])
  })
  it("a typed/query anchor not listed in the root-signed record is ignored", () => {
    const s = selectAnchors({ rootFrom: "pinned", records: [rec], pinned: [], supplied: [ATTACKER], fromPage: [] })
    expect(s.refs).toEqual([GOOD])
    expect(s.ignored[0]?.ref).toBe(ATTACKER)
  })
  it("a supplied anchor that the record lists is accepted (deduplicated)", () => {
    const s = selectAnchors({ rootFrom: "pinned", records: [rec], pinned: [], supplied: [GOOD], fromPage: [] })
    expect(s.refs).toEqual([GOOD])
    expect(s.ignored).toEqual([])
  })
  it("anchors the user pinned earlier count even with no record", () => {
    expect(selectAnchors({ rootFrom: "pinned", records: [], pinned: [GOOD], supplied: [], fromPage: [] }).refs).toEqual([GOOD])
  })
  it("when the root itself came from the page, the record it signs proves nothing: no record anchors", () => {
    const evilRec = record({ creator: EVIL, publisher: PUB_A, anchors: [{ kind: "github", ref: "github:attacker/phish/.well-known/officially.json" }] })
    const s = selectAnchors({ rootFrom: "page", records: [evilRec], pinned: [], supplied: [], fromPage: [] })
    expect(s.refs).toEqual([])
    expect(s.ignored[0]?.reason).toContain("page")
  })
})

describe("hijacked page that offers an attacker root + attacker anchor", () => {
  it("cannot reach OFFICIAL: the page's anchor is dropped, so the key stays unconfirmed", async () => {
    const T = normalizeTarget("https://app.demo-swap.example")
    const evilRec = record({ creator: EVIL, publisher: PUB_A, anchors: [{ kind: "github", ref: "github:attacker/phish/.well-known/officially.json" }] })
    const v0 = decideVerdict({
      targetHash: hashTarget(T), target: T.value, currentBlock: 200_000n, pin: { rootKey: EVIL },
      projectRecords: [evilRec],
      claims: [claim({ targetHash: hashTarget(T), creator: PUB_A, createdAtBlock: 1n })], incidents: [],
    })
    // the attacker's anchor really does name the attacker's key (so naive anchor handling would confirm it)
    const fetcher = { fetchText: async (u: string) => (u === ATTACKER ? DOC(EVIL) : undefined) }
    const naive = applyAnchor(v0, await confirmRootKey(fetcher, EVIL, [ATTACKER]))
    expect(naive.status).toBe("OFFICIAL") // what the old CLI/page flow would have allowed
    const sel = selectAnchors({ rootFrom: "page", records: [evilRec], pinned: [], supplied: [], fromPage: [ATTACKER] })
    const safe = applyAnchor(v0, await confirmRootKey(fetcher, EVIL, sel.refs))
    expect(safe.status).toBe("UNVERIFIED_KEY")
    expect(evaluateAnchors(EVIL, []).state).toBe("ABSENT")
  })
})
