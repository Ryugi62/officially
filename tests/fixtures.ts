import type { Address, EndpointClaim, Hex, Incident, ProjectRecord } from "../src/domain/types"

export const ROOT = "0x1111111111111111111111111111111111111111" as Address
export const PUB_A = "0xaaaa00000000000000000000000000000000aaaa" as Address
export const PUB_B = "0xbbbb00000000000000000000000000000000bbbb" as Address
export const EVIL = "0xeeee00000000000000000000000000000000eeee" as Address
export const BURN = "0x000000000000000000000000000000000000dead" as Address

let n = 0
const nextKey = (): Hex => ("0x" + (++n).toString(16).padStart(64, "0")) as Hex

export function record(p: Partial<ProjectRecord> & { publisher: Address }): ProjectRecord {
  return {
    entity: "project",
    key: nextKey(),
    creator: ROOT,
    owner: ROOT,
    createdAtBlock: 1n,
    expiresAtBlock: 10_000_000n,
    slug: "demo-swap",
    name: "Demo Swap (synthetic)",
    anchors: [],
    revokes: undefined,
    ...p,
  }
}

export function claim(p: Partial<EndpointClaim> & { targetHash: Hex; creator: Address }): EndpointClaim {
  return {
    entity: "endpoint",
    key: nextKey(),
    owner: p.creator,
    createdAtBlock: 1n,
    expiresAtBlock: 1_000_000n,
    target: "https://app.demo-swap.example",
    targetKind: "web",
    projectSlug: "demo-swap",
    label: "App",
    ...p,
  }
}

export function incident(p: Partial<Incident> & { targetHash: Hex; creator: Address }): Incident {
  return {
    entity: "incident",
    key: nextKey(),
    owner: BURN,
    createdAtBlock: 2n,
    expiresAtBlock: 900_000n,
    severity: 3,
    title: "Frontend compromised",
    advice: "Do not sign anything on this domain.",
    projectSlug: "demo-swap",
    ...p,
  }
}
