import { hashTarget } from "../domain/hash"
import type { Address, EndpointClaim, Pin, Target, Verdict, VerdictStatus } from "../domain/types"
import { decideVerdict } from "../domain/verdict"
import type { AttestationReader } from "./ports"

/** Worst first: a transaction is only as safe as the least safe address it authorizes. */
export const SEVERITY_ORDER: VerdictStatus[] = ["INCIDENT", "FORGED", "REVOKED", "UNLISTED", "UNPINNED", "PROBATION", "OFFICIAL"]
export const worst = (vs: Verdict[]): Verdict =>
  [...vs].sort((a, b) => SEVERITY_ORDER.indexOf(a.status) - SEVERITY_ORDER.indexOf(b.status))[0]!

const CONFLICT_SAMPLE = 50

/**
 * Reads for any number of targets in at most 3 calls:
 * project records of the pinned root → attestations created by its keys ($creator filter) + a bounded sample of all claimants.
 */
export async function assessTargets(reader: AttestationReader, targets: Target[], pin: Pin | undefined): Promise<Verdict[]> {
  const hashes = [...new Set(targets.map(hashTarget))]
  const records = pin ? await reader.findProjectRecords(pin.rootKey) : []
  const creators: Address[] | undefined = pin
    ? [...new Set([pin.rootKey, ...records.flatMap((r) => [r.publisher, ...(r.revokes ? [r.revokes] : []), ...(r.previousPublishers ?? []).map((p) => p.address)])].map((a) => a.toLowerCase() as Address))]
    : undefined
  const [att, conflicts] = await Promise.all([
    reader.findAttestations(hashes, creators),
    pin ? reader.findClaimants(hashes, CONFLICT_SAMPLE) : Promise.resolve([] as EndpointClaim[]),
  ])
  const byKey = new Map<string, EndpointClaim>()
  for (const c of [...att.claims, ...conflicts]) byKey.set(c.key, c)
  const claims = [...byKey.values()]
  return targets.map((t) =>
    decideVerdict({
      targetHash: hashTarget(t),
      target: t.value,
      currentBlock: att.atBlock,
      pin,
      projectRecords: records,
      claims,
      incidents: att.incidents,
    }),
  )
}
