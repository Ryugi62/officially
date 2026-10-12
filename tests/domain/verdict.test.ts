// AC-3..AC-9 verdict rules
import { describe, expect, it } from "vitest"
import fc from "fast-check"
import { decideVerdict } from "../../src/domain/verdict"
import { hashTarget, PROJECT_WIDE } from "../../src/domain/hash"
import { normalizeTarget } from "../../src/domain/target"
import { claim, EVIL, incident, PUB_A, PUB_B, record, ROOT } from "../fixtures"
const ROOT_NEXT = "0xcccc00000000000000000000000000000000cccc" as `0x${string}`

const H = hashTarget(normalizeTarget("https://app.demo-swap.example"))
const NOW = 100_000n
const pin = { rootKey: ROOT }

describe("decideVerdict", () => {
  it("AC-3 OFFICIAL when a live claim is created by the root's current publisher", () => {
    const v = decideVerdict({
      targetHash: H, currentBlock: NOW, pin,
      projectRecords: [record({ publisher: PUB_A })],
      claims: [claim({ targetHash: H, creator: PUB_A, expiresAtBlock: 900_000n })],
      incidents: [],
    })
    expect(v.status).toBe("OFFICIAL")
    expect(v.leaseExpiresAtBlock).toBe(900_000n)
    expect(v.trustedBy).toBe(PUB_A)
  })

  it("AC-3 the root key itself is trusted", () => {
    const v = decideVerdict({
      targetHash: H, currentBlock: NOW, pin,
      projectRecords: [record({ publisher: PUB_A })],
      claims: [claim({ targetHash: H, creator: ROOT })],
      incidents: [],
    })
    expect(v.status).toBe("OFFICIAL")
  })

  it("AC-4 FORGED when an identical claim is created by another key", () => {
    const v = decideVerdict({
      targetHash: H, currentBlock: NOW, pin,
      projectRecords: [record({ publisher: PUB_A })],
      claims: [claim({ targetHash: H, creator: EVIL })],
      incidents: [],
    })
    expect(v.status).toBe("FORGED")
    expect(v.claimants).toContain(EVIL)
  })

  it("AC-4 a forged copy next to the real claim does not hide the real one", () => {
    const v = decideVerdict({
      targetHash: H, currentBlock: NOW, pin,
      projectRecords: [record({ publisher: PUB_A })],
      claims: [claim({ targetHash: H, creator: EVIL }), claim({ targetHash: H, creator: PUB_A })],
      incidents: [],
    })
    expect(v.status).toBe("OFFICIAL")
    expect(v.untrustedClaimants).toEqual([EVIL])
  })

  it("AC-5 writable fields never make an untrusted claim official (property)", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.string(), (slug, label, target) => {
        const v = decideVerdict({
          targetHash: H, currentBlock: NOW, pin,
          projectRecords: [record({ publisher: PUB_A, slug: "demo-swap" })],
          claims: [claim({ targetHash: H, creator: EVIL, projectSlug: slug, label, target })],
          incidents: [],
        })
        return v.status === "FORGED"
      }),
    )
  })

  it("AC-5 a record not created by the pinned root grants nothing", () => {
    const v = decideVerdict({
      targetHash: H, currentBlock: NOW, pin,
      projectRecords: [record({ publisher: EVIL, creator: EVIL })],
      claims: [claim({ targetHash: H, creator: EVIL })],
      incidents: [],
    })
    expect(v.status).toBe("FORGED")
  })

  it("AC-6 a trusted incident on the target overrides OFFICIAL", () => {
    const v = decideVerdict({
      targetHash: H, currentBlock: NOW, pin,
      projectRecords: [record({ publisher: PUB_A })],
      claims: [claim({ targetHash: H, creator: PUB_A })],
      incidents: [incident({ targetHash: H, creator: PUB_A })],
    })
    expect(v.status).toBe("INCIDENT")
    expect(v.incident?.title).toBe("Frontend compromised")
  })

  it("AC-6 a project-wide incident by the root overrides OFFICIAL", () => {
    const v = decideVerdict({
      targetHash: H, currentBlock: NOW, pin,
      projectRecords: [record({ publisher: PUB_A })],
      claims: [claim({ targetHash: H, creator: PUB_A })],
      incidents: [incident({ targetHash: PROJECT_WIDE, creator: ROOT })],
    })
    expect(v.status).toBe("INCIDENT")
  })

  it("AC-6 an incident by an untrusted key does not change the verdict but is surfaced", () => {
    const v = decideVerdict({
      targetHash: H, currentBlock: NOW, pin,
      projectRecords: [record({ publisher: PUB_A })],
      claims: [claim({ targetHash: H, creator: PUB_A })],
      incidents: [incident({ targetHash: H, creator: EVIL })],
    })
    expect(v.status).toBe("OFFICIAL")
    expect(v.unverifiedWarnings).toHaveLength(1)
  })

  it("AC-6 an expired incident is ignored", () => {
    const v = decideVerdict({
      targetHash: H, currentBlock: NOW, pin,
      projectRecords: [record({ publisher: PUB_A })],
      claims: [claim({ targetHash: H, creator: PUB_A })],
      incidents: [incident({ targetHash: H, creator: PUB_A, expiresAtBlock: NOW })],
    })
    expect(v.status).toBe("OFFICIAL")
  })

  it("AC-7 REVOKED when the claim comes from a publisher the root rotated away from", () => {
    const v = decideVerdict({
      targetHash: H, currentBlock: NOW, pin,
      projectRecords: [record({ publisher: PUB_B, revokes: PUB_A })],
      claims: [claim({ targetHash: H, creator: PUB_A })],
      incidents: [],
    })
    expect(v.status).toBe("REVOKED")
  })

  it("AC-8 UNLISTED when nobody claims the target", () => {
    const v = decideVerdict({
      targetHash: H, currentBlock: NOW, pin,
      projectRecords: [record({ publisher: PUB_A })],
      claims: [], incidents: [],
    })
    expect(v.status).toBe("UNLISTED")
  })

  it("AC-8 UNPINNED lists every claimant for the user to check", () => {
    const v = decideVerdict({
      targetHash: H, currentBlock: NOW, pin: undefined,
      projectRecords: [],
      claims: [claim({ targetHash: H, creator: PUB_A }), claim({ targetHash: H, creator: EVIL })],
      incidents: [],
    })
    expect(v.status).toBe("UNPINNED")
    expect(new Set(v.claimants)).toEqual(new Set([PUB_A, EVIL]))
  })

  it("AC-9 a claim whose lease has lapsed counts as absent", () => {
    const v = decideVerdict({
      targetHash: H, currentBlock: NOW, pin,
      projectRecords: [record({ publisher: PUB_A })],
      claims: [claim({ targetHash: H, creator: PUB_A, expiresAtBlock: NOW })],
      incidents: [],
    })
    expect(v.status).toBe("UNLISTED")
  })

  it("AC-9 a lapsed project record grants nothing", () => {
    const v = decideVerdict({
      targetHash: H, currentBlock: NOW, pin,
      projectRecords: [record({ publisher: PUB_A, expiresAtBlock: NOW - 1n })],
      claims: [claim({ targetHash: H, creator: PUB_A })],
      incidents: [],
    })
    expect(v.status).toBe("FORGED")
  })

  it("compares addresses case-insensitively", () => {
    const v = decideVerdict({
      targetHash: H, currentBlock: NOW, pin: { rootKey: ROOT.toUpperCase().replace("0X", "0x") as typeof ROOT },
      projectRecords: [record({ publisher: PUB_A.toUpperCase().replace("0X", "0x") as typeof PUB_A })],
      claims: [claim({ targetHash: H, creator: PUB_A })],
      incidents: [],
    })
    expect(v.status).toBe("OFFICIAL")
  })

  it("ignores claims for another target hash", () => {
    const other = hashTarget(normalizeTarget("https://other.example"))
    const v = decideVerdict({
      targetHash: H, currentBlock: NOW, pin,
      projectRecords: [record({ publisher: PUB_A })],
      claims: [claim({ targetHash: other, creator: PUB_A })],
      incidents: [],
    })
    expect(v.status).toBe("UNLISTED")
  })
})

describe("probation (AC-17)", () => {
  it("a trusted claim younger than 48 h is PROBATION, older is OFFICIAL", () => {
    const young = decideVerdict({
      targetHash: H, currentBlock: 100_000n, pin,
      projectRecords: [record({ publisher: PUB_A })],
      claims: [claim({ targetHash: H, creator: PUB_A, createdAtBlock: 100_000n - 86_399n, expiresAtBlock: 2_000_000n })],
      incidents: [],
    })
    expect(young.status).toBe("PROBATION")
    const old = decideVerdict({
      targetHash: H, currentBlock: 100_000n, pin,
      projectRecords: [record({ publisher: PUB_A })],
      claims: [claim({ targetHash: H, creator: PUB_A, createdAtBlock: 100_000n - 86_400n, expiresAtBlock: 2_000_000n })],
      incidents: [],
    })
    expect(old.status).toBe("OFFICIAL")
  })
  it("one settled claim is enough even if a newer duplicate is on probation", () => {
    const v = decideVerdict({
      targetHash: H, currentBlock: 100_000n, pin,
      projectRecords: [record({ publisher: PUB_A })],
      claims: [
        claim({ targetHash: H, creator: PUB_A, createdAtBlock: 99_999n, expiresAtBlock: 2_000_000n }),
        claim({ targetHash: H, creator: PUB_A, createdAtBlock: 1n, expiresAtBlock: 2_000_000n }),
      ],
      incidents: [],
    })
    expect(v.status).toBe("OFFICIAL")
  })
})

describe("mock-judge fixes (round 1)", () => {
  it("rotation never silences an incident: one raised by a retired publisher still restricts", () => {
    const v = decideVerdict({
      targetHash: H, currentBlock: NOW, pin,
      projectRecords: [record({ publisher: PUB_B, revokes: PUB_A })],
      claims: [claim({ targetHash: H, creator: PUB_B })],
      incidents: [incident({ targetHash: H, creator: PUB_A })],
    })
    expect(v.status).toBe("INCIDENT")
  })
  it("after two rotations, claims by the first publisher are still REVOKED (history kept in the record)", () => {
    const v = decideVerdict({
      targetHash: H, currentBlock: NOW, pin,
      projectRecords: [record({ publisher: ROOT_NEXT, revokes: PUB_B, previousPublishers: [PUB_A, PUB_B] })],
      claims: [claim({ targetHash: H, creator: PUB_A })],
      incidents: [],
    })
    expect(v.status).toBe("REVOKED")
  })
  it("after two rotations, an incident by the first publisher still restricts", () => {
    const v = decideVerdict({
      targetHash: H, currentBlock: NOW, pin,
      projectRecords: [record({ publisher: ROOT_NEXT, revokes: PUB_B, previousPublishers: [PUB_A, PUB_B] })],
      claims: [claim({ targetHash: H, creator: ROOT_NEXT })],
      incidents: [incident({ targetHash: H, creator: PUB_A })],
    })
    expect(v.status).toBe("INCIDENT")
  })
})
