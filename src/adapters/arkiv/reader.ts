import type { PublicArkivClient } from "@arkiv-network/sdk"
import { addr, bytes32, str } from "@arkiv-network/sdk/attr"
import { and, eq, or } from "@arkiv-network/sdk/query"
import type { AttestationReader } from "../../application/ports"
import { NAMESPACE } from "../../domain/contract"
import { PROJECT_WIDE } from "../../domain/hash"
import type { Address, EndpointClaim, Hex, Incident, ProjectRecord } from "../../domain/types"
import { fromSdkEntity } from "./codec"

export class ReadTimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`Arkiv RPC did not answer "${what}" within ${ms / 1000}s (the public RPC may be rate-limiting this IP — try again in a minute)`)
    this.name = "ReadTimeoutError"
  }
}

function withTimeout<T>(p: Promise<T>, what: string, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<never>((_, reject) => {
      t = setTimeout(() => reject(new ReadTimeoutError(what, ms)), ms)
    }),
  ])
}

/** The queries the app runs — also printed in /arkiv/schema.md. */
export const QUERIES = {
  projectRecords: (root: Address) => ({ where: and(eq("app", str(NAMESPACE)), eq("type", str("project"))), createdBy: root }),
  attestations: (hashes: Hex[], creators?: Address[]) => {
    const anyHash = or(...hashes.map((h) => eq("target_hash", bytes32(h))))
    const parts = [
      eq("app", str(NAMESPACE)),
      or(and(eq("type", str("endpoint")), anyHash), and(eq("type", str("incident")), or(anyHash, eq("target_hash", bytes32(PROJECT_WIDE))))),
    ]
    if (creators?.length) parts.push(or(...creators.map((c) => eq("$creator", addr(c)))))
    return { where: and(...parts) }
  },
  claimants: (hashes: Hex[]) => ({
    where: and(eq("app", str(NAMESPACE)), eq("type", str("endpoint")), or(...hashes.map((h) => eq("target_hash", bytes32(h))))),
  }),
  claimsBy: (creator: Address) => ({ where: and(eq("app", str(NAMESPACE)), eq("type", str("endpoint"))), createdBy: creator }),
  projects: () => ({ where: and(eq("app", str(NAMESPACE)), eq("type", str("project"))) }),
  incidentsBy: (creators: Address[]) => ({ where: and(eq("app", str(NAMESPACE)), eq("type", str("incident")), or(...creators.map((c) => eq("$creator", addr(c))))) }),
}

export class ArkivReader implements AttestationReader {
  private last: { block: bigint; at: number } | undefined
  constructor(
    private readonly client: PublicArkivClient,
    private readonly timeoutMs = 15_000,
  ) {}

  private async run(q: { where: ReturnType<typeof and>; createdBy?: Address }, what: string, cursor?: string, limit = 200) {
    let b = this.client.select().where(q.where).limit(limit)
    if (q.createdBy) b = b.createdBy(q.createdBy)
    if (cursor) b = b.cursor(cursor)
    const r = await withTimeout(b.fetch(), what, this.timeoutMs)
    this.last = { block: r.blockNumber, at: Date.now() }
    return { items: r.entities.map((e) => fromSdkEntity(e)).filter((x) => x !== undefined), cursor: r.cursor, block: r.blockNumber }
  }

  async findProjectRecords(rootKey: Address): Promise<ProjectRecord[]> {
    const r = await this.run(QUERIES.projectRecords(rootKey), "project records")
    return r.items.filter((x): x is ProjectRecord => x.entity === "project")
  }

  async findAttestations(targetHashes: Hex[], creators?: Address[]) {
    const r = await this.run(QUERIES.attestations(targetHashes, creators), "attestations")
    return {
      claims: r.items.filter((x): x is EndpointClaim => x.entity === "endpoint"),
      incidents: r.items.filter((x): x is Incident => x.entity === "incident"),
      atBlock: r.block,
    }
  }

  async findClaimants(targetHashes: Hex[], limit: number): Promise<EndpointClaim[]> {
    const r = await this.run(QUERIES.claimants(targetHashes), "claimants", undefined, limit)
    return r.items.filter((x): x is EndpointClaim => x.entity === "endpoint")
  }

  async findClaimsByCreator(creator: Address): Promise<EndpointClaim[]> {
    const out: EndpointClaim[] = []
    let cursor: string | undefined
    do {
      const r = await this.run(QUERIES.claimsBy(creator), "claims by creator", cursor)
      out.push(...r.items.filter((x): x is EndpointClaim => x.entity === "endpoint"))
      cursor = r.cursor
    } while (cursor)
    return out
  }

  /** Every project record (directory), one page at a time. */
  async listProjects(cursor?: string): Promise<{ records: ProjectRecord[]; cursor: string | undefined }> {
    const r = await this.run(QUERIES.projects(), "projects", cursor)
    return { records: r.items.filter((x): x is ProjectRecord => x.entity === "project"), cursor: r.cursor }
  }

  /** Live incidents created by any of these keys (the "Live incidents" panel on load). */
  async listIncidentsBy(creators: Address[]): Promise<Incident[]> {
    const r = await this.run(QUERIES.incidentsBy(creators), "incidents")
    return r.items.filter((x): x is Incident => x.entity === "incident")
  }

  async findIncident(key: Hex): Promise<Incident | undefined> {
    const e = await withTimeout(this.client.getEntity(key).catch(() => undefined), "incident", this.timeoutMs)
    const d = e ? fromSdkEntity(e) : undefined
    return d?.entity === "incident" ? d : undefined
  }

  async currentBlock(): Promise<bigint> {
    if (this.last && Date.now() - this.last.at < 4_000) return this.last.block
    return withTimeout(this.client.getBlockNumber(), "block number", this.timeoutMs)
  }
}
