import type { AttrType, EntityName } from "../domain/contract"
import type { Address, EndpointClaim, Hex, Incident, ProjectRecord } from "../domain/types"

export interface AttestationReader {
  /** Project records created by this root (1 read). */
  findProjectRecords(rootKey: Address): Promise<ProjectRecord[]>
  /**
   * Endpoint claims and incidents on any of the hashes (incidents also project-wide), in 1 read.
   * With `creators`, only entities those keys created ($creator filter) — so other keys' spam cannot crowd them out.
   * Returns the block the read was answered at.
   */
  findAttestations(targetHashes: Hex[], creators?: Address[]): Promise<{ claims: EndpointClaim[]; incidents: Incident[]; atBlock: bigint }>
  /** Up to `limit` endpoint claims on the hashes by anyone — used only to count and show conflicting claimants (1 read). */
  findClaimants(targetHashes: Hex[], limit: number): Promise<EndpointClaim[]>
  /** Live endpoint claims created by this key (for renewals). */
  findClaimsByCreator(creator: Address): Promise<EndpointClaim[]>
  currentBlock(): Promise<bigint>
}

export interface AttributeValue {
  name: string
  type: AttrType
  value: string | number | bigint
}

export interface CreateSpec {
  entity: EntityName
  attributes: AttributeValue[]
  payload: Record<string, unknown>
  expiresInSeconds: number
  flags: { readonly: boolean; permissionlessExtension: boolean }
  salt?: bigint
}

/** One atomic Arkiv transaction: every operation lands, or none does. */
export interface WriteBatch {
  creates: CreateSpec[]
  extensions: { key: Hex; expiresInSeconds: number }[]
  ownershipChanges: { key: Hex; newOwner: Address }[]
  deletes: { key: Hex }[]
}

export interface AttestationWriter {
  readonly address: Address
  /** Keys the next `count` creates from this wallet will get, each with the salt that produces it. */
  predictKeys(count: number): Promise<{ key: Hex; salt: bigint }[]>
  submit(batch: WriteBatch): Promise<{ txHash: Hex; created: Hex[] }>
}

export const emptyBatch = (): WriteBatch => ({ creates: [], extensions: [], ownershipChanges: [], deletes: [] })
