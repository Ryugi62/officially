import { describe, expect, it } from "vitest"
import { anchorEvidenceFor } from "../../src/application/confirm-root"
import { FakeReader } from "./fakes"
import { applyAnchor } from "../../src/domain/anchor"
import { record, ROOT, PUB_A, EVIL } from "../fixtures"

const GOOD = "https://raw.githubusercontent.com/Ryugi62/demo-swap-site/main/.well-known/officially.json"
const ATTACKER = "https://raw.githubusercontent.com/attacker/phish/main/.well-known/officially.json"
const doc = (k: string) => JSON.stringify({ officially: { rootKey: k } })
const web: Record<string, string> = { [GOOD]: doc(ROOT), [ATTACKER]: doc(EVIL) }
const fetcher = { fetchText: async (u: string) => web[u] }
const rec = record({ publisher: PUB_A, anchors: [{ kind: "github", ref: "github:Ryugi62/demo-swap-site/.well-known/officially.json" }] })

describe("anchorEvidenceFor", () => {
  it("reads the anchor from the root-signed record: no flag needed", async () => {
    const ev = await anchorEvidenceFor(fetcher, new FakeReader([rec]), ROOT, { rootFrom: "pinned" })
    expect(ev?.state).toBe("CONFIRMED")
    expect(ev?.confirmedBy).toEqual([GOOD])
  })
  it("an attacker anchor offered by the page is ignored, reported, and cannot confirm an attacker root", async () => {
    const evilRec = record({ creator: EVIL, publisher: PUB_A, anchors: [{ kind: "github", ref: ATTACKER }] })
    const ev = await anchorEvidenceFor(fetcher, new FakeReader([evilRec]), EVIL, { rootFrom: "page", fromPage: [ATTACKER] })
    expect(ev?.state).toBe("ABSENT")
    expect(ev?.confirmedBy).toEqual([])
    expect(ev?.reasons.join(" ")).toContain(ATTACKER)
  })
  it("a --anchor-url the record does not list is ignored even when it names the pinned root", async () => {
    web["https://example.org/x.json"] = doc(ROOT)
    const ev = await anchorEvidenceFor(fetcher, new FakeReader([rec]), ROOT, { rootFrom: "pinned", supplied: ["https://example.org/x.json"] })
    expect(ev?.confirmedBy).toEqual([GOOD])
    expect(ev?.reasons.join(" ")).toContain("https://example.org/x.json")
  })
  it("no record anchors and nothing supplied: no evidence (pin-only, as before)", async () => {
    expect(await anchorEvidenceFor(fetcher, new FakeReader([record({ publisher: PUB_A })]), ROOT, { rootFrom: "pinned" })).toBeUndefined()
  })
  it("the ignored anchor is still visible in the verdict reasons when the record's anchor confirms", async () => {
    const ev = await anchorEvidenceFor(fetcher, new FakeReader([rec]), ROOT, { rootFrom: "pinned", supplied: [ATTACKER] })
    const v = applyAnchor({ status: "OFFICIAL", reasons: [] } as never, ev!)
    expect(v.status).toBe("OFFICIAL")
    expect(v.reasons.join("\n")).toContain(`anchor ignored ${ATTACKER}`)
  })
})
