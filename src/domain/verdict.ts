import { PROJECT_WIDE } from "./hash"
import { PROBATION_BLOCKS } from "./lifetimes"
import type { Address, EndpointClaim, Hex, Incident, Pin, ProjectRecord, Verdict } from "./types"

export interface VerdictInput {
  targetHash: Hex
  target?: string
  currentBlock: bigint
  pin: Pin | undefined
  /** project records returned for the pinned root (any creator — filtered here) */
  projectRecords: ProjectRecord[]
  /** every endpoint claim on the target hash, from any creator */
  claims: EndpointClaim[]
  /** incidents on the target hash or project-wide, from any creator */
  incidents: Incident[]
}

const lower = (a: string) => a.toLowerCase()
const live = (e: { expiresAtBlock: bigint }, now: bigint) => e.expiresAtBlock > now

/**
 * Trust comes only from who created an entity ($creator). Every writable field (slug, label, kind,
 * payload) is display-only: rules below never read them.
 */
export function trustedKeys(pin: Pin, records: ProjectRecord[], now: bigint): { trusted: Set<string>; revoked: Set<string> } {
  const root = lower(pin.rootKey)
  const own = records.filter((r) => lower(r.creator) === root && live(r, now))
  const trusted = new Set<string>([root, ...own.map((r) => lower(r.publisher))])
  const revoked = new Set<string>(own.flatMap((r) => (r.revokes ? [lower(r.revokes)] : [])).filter((a) => !trusted.has(a)))
  return { trusted, revoked }
}

export function decideVerdict(input: VerdictInput): Verdict {
  const { targetHash, currentBlock: now, pin } = input
  const claims = input.claims.filter((c) => c.targetHash === targetHash && live(c, now))
  const incidents = input.incidents.filter((i) => (i.targetHash === targetHash || i.targetHash === PROJECT_WIDE) && live(i, now))
  const claimants = [...new Set(claims.map((c) => c.creator))]
  const base = {
    targetHash,
    ...(input.target !== undefined && { target: input.target }),
    claimants,
  }
  const recheck = (xs: { expiresAtBlock: bigint }[]) =>
    xs.length ? xs.reduce((m, x) => (x.expiresAtBlock < m ? x.expiresAtBlock : m), xs[0]!.expiresAtBlock) : undefined

  if (!pin) {
    const r = recheck(claims)
    return {
      ...base,
      status: "UNPINNED",
      untrustedClaimants: claimants,
      unverifiedWarnings: incidents.filter((i) => i.targetHash === targetHash),
      ...(r !== undefined && { recheckAtBlock: r }),
      reasons: claimants.length
        ? [`${claimants.length} key(s) claim this target. Pin the project's root key (check its anchors) to decide.`]
        : ["No project has published this target."],
    }
  }

  const { trusted, revoked } = trustedKeys(pin, input.projectRecords, now)
  const isTrusted = (a: Address) => trusted.has(lower(a))
  const trustedClaims = claims.filter((c) => isTrusted(c.creator))
  const trustedIncidents = incidents.filter((i) => isTrusted(i.creator))
  const unverifiedWarnings = incidents.filter((i) => !isTrusted(i.creator) && i.targetHash === targetHash)
  const untrustedClaimants = claimants.filter((a) => !isTrusted(a))
  const common = { ...base, untrustedClaimants, unverifiedWarnings }

  if (trustedIncidents.length) {
    const worst = [...trustedIncidents].sort((a, b) => b.severity - a.severity || Number(b.createdAtBlock - a.createdAtBlock))[0]!
    const r = recheck(trustedIncidents)
    return {
      ...common,
      status: "INCIDENT",
      incident: worst,
      ...(r !== undefined && { recheckAtBlock: r }),
      reasons: [
        worst.targetHash === PROJECT_WIDE ? "The project raised a project-wide incident." : "The project raised an incident on this target.",
        `Signed by ${worst.creator}, a key the pinned root trusts.`,
      ],
    }
  }

  if (trustedClaims.length) {
    const settled = trustedClaims.filter((c) => now - c.createdAtBlock >= PROBATION_BLOCKS)
    if (settled.length === 0) {
      const newest = [...trustedClaims].sort((a, b) => Number(a.createdAtBlock - b.createdAtBlock))[0]!
      const settlesAt = newest.createdAtBlock + PROBATION_BLOCKS
      return {
        ...common,
        status: "PROBATION",
        claim: newest,
        trustedBy: newest.creator,
        leaseExpiresAtBlock: newest.expiresAtBlock,
        recheckAtBlock: settlesAt,
        reasons: [
          `Published by ${newest.creator}, a key the pinned root trusts, less than 48 hours ago.`,
          "New endpoints are held for 48 hours so the team can notice a stolen publisher key before anyone relies on it.",
        ],
      }
    }
    const best = [...settled].sort((a, b) => Number(b.expiresAtBlock - a.expiresAtBlock))[0]!
    return {
      ...common,
      status: "OFFICIAL",
      claim: best,
      trustedBy: best.creator,
      leaseExpiresAtBlock: best.expiresAtBlock,
      recheckAtBlock: best.expiresAtBlock,
      reasons: [`Published by ${best.creator}, a key the pinned root trusts.`, "The lease is live; it lapses unless the project renews it."],
    }
  }

  const revokedClaim = claims.find((c) => revoked.has(lower(c.creator)))
  if (revokedClaim) {
    return {
      ...common,
      status: "REVOKED",
      claim: revokedClaim,
      reasons: [`Published by ${revokedClaim.creator}, a key the project's root has rotated away from.`],
    }
  }

  if (claims.length) {
    return {
      ...common,
      status: "FORGED",
      claim: claims[0]!,
      reasons: [
        `Claimed by ${untrustedClaimants.join(", ")}, which is not a key of the pinned project.`,
        "Its name and labels are self-declared and do not count.",
      ],
    }
  }

  return { ...common, status: "UNLISTED", reasons: ["The pinned project has not published this target (or its lease lapsed)."] }
}
