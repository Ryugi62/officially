export type Hex = `0x${string}`
export type Address = `0x${string}`

export type TargetKind = "web" | "contract" | "social"
export interface Target {
  kind: TargetKind
  value: string
}

export interface Anchor {
  /** where the project states its root key: github | ens | well-known */
  kind: "github" | "ens" | "well-known"
  ref: string
}

interface AttestationBase {
  key: Hex
  /** immutable author ($creator) — the only thing trust is derived from */
  creator: Address
  /** mutable ($owner) */
  owner: Address
  createdAtBlock: bigint
  expiresAtBlock: bigint
}

export interface ProjectRecord extends AttestationBase {
  entity: "project"
  slug: string
  name: string
  publisher: Address
  revokes: Address | undefined
  /** publishers retired before `revokes`, with the block their warning power ended (payload) — REVOKED and incidents survive several rotations */
  previousPublishers?: RetiredPublisher[]
  /** the root's estimate of when `revokes` was stolen: its incidents from this block on are void (payload, optional) */
  compromisedSinceBlock?: bigint
  anchors: Anchor[]
}

export interface RetiredPublisher {
  address: Address
  /** incidents this key created before this block still restrict; later ones do not (griefing by a thief) */
  retiredAtBlock: bigint
}

export interface EndpointClaim extends AttestationBase {
  entity: "endpoint"
  targetHash: Hex
  target: string
  targetKind: TargetKind
  /** self-declared, writable by anyone — display only */
  projectSlug: string
  label: string
  /** published with a scheduled retirement: renewals leave it to lapse */
  retiring?: boolean
}

export interface Incident extends AttestationBase {
  entity: "incident"
  targetHash: Hex
  /** normalized target from the payload, or "*" for the whole project — display only */
  target: string
  severity: number
  title: string
  advice: string
  projectSlug: string
}

export interface Pin {
  rootKey: Address
  slug?: string
}

export type VerdictStatus = "OFFICIAL" | "PROBATION" | "INCIDENT" | "FORGED" | "REVOKED" | "UNLISTED" | "UNPINNED" | "UNVERIFIED_KEY"

export interface Verdict {
  status: VerdictStatus
  target?: string
  targetHash: Hex
  /** key that made the claim trusted (OFFICIAL) */
  trustedBy?: Address
  leaseExpiresAtBlock?: bigint
  claim?: EndpointClaim
  incident?: Incident
  /** every creator that claims this target */
  claimants: Address[]
  /** claimants that are not trusted for the pinned project */
  untrustedClaimants: Address[]
  /** incidents on this target by keys that are not trusted — shown, never acted on */
  unverifiedWarnings: Incident[]
  /** earliest block at which this verdict can change by expiry alone */
  recheckAtBlock?: bigint
  reasons: string[]
}
