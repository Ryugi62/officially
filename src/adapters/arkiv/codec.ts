import { ExpirationTime, type Entity } from "@arkiv-network/sdk"
import { addr, bytes32, i32, str, u64 } from "@arkiv-network/sdk/attr"
import type { ExecuteBatchParameters } from "@arkiv-network/sdk"
import type { AttributeValue, WriteBatch } from "../../application/ports"
import { NAMESPACE } from "../../domain/contract"
import { BLOCK_SECONDS } from "../../domain/lifetimes"
import type { Address, Anchor, EndpointClaim, Hex, Incident, ProjectRecord, TargetKind } from "../../domain/types"

function lifetime(seconds: number) {
  if (!Number.isInteger(seconds) || seconds <= 0 || seconds % BLOCK_SECONDS !== 0) {
    throw new RangeError(`Lifetime ${seconds}s is not a whole number of ${BLOCK_SECONDS}-second blocks`)
  }
  return ExpirationTime.fromSeconds(seconds)
}

function toValue(a: AttributeValue) {
  switch (a.type) {
    case "str":
      return str(String(a.value))
    case "bytes32":
      return bytes32(a.value as Hex)
    case "addr":
      return addr(String(a.value))
    case "i32":
      return i32(Number(a.value))
    case "u64":
      return u64(BigInt(a.value))
  }
}

export function toSdkBatch(batch: WriteBatch): ExecuteBatchParameters {
  return {
    creates: batch.creates.map((c) => ({
      payload: new TextEncoder().encode(JSON.stringify(c.payload)),
      contentType: "application/json",
      attributes: Object.fromEntries(c.attributes.map((a) => [a.name, toValue(a)])),
      expires: lifetime(c.expiresInSeconds),
      flags: { ...c.flags },
      ...(c.salt !== undefined && { salt: c.salt }),
    })),
    extensions: batch.extensions.map((e) => ({ entityKey: e.key, expires: lifetime(e.expiresInSeconds) })),
    ownershipChanges: batch.ownershipChanges.map((o) => ({ entityKey: o.key, newOwner: o.newOwner })),
    deletes: batch.deletes.map((d) => ({ entityKey: d.key })),
  }
}

type Attrs = Record<string, { value?: unknown } | undefined>
const s = (attrs: Attrs, name: string) => {
  const v = attrs[name]?.value
  return typeof v === "string" ? v : v === undefined ? undefined : String(v)
}

function payloadJson(e: Entity): Record<string, unknown> {
  try {
    return e.payload && e.payload.length ? (JSON.parse(new TextDecoder().decode(e.payload)) as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
const text = (v: unknown) => (typeof v === "string" ? v : "")

/** Maps an Arkiv entity of the officially.v1 contract to a domain object; anything else → undefined. */
export function fromSdkEntity(e: Entity): ProjectRecord | EndpointClaim | Incident | undefined {
  const attrs = (e.attributes ?? {}) as Attrs
  if (s(attrs, "app") !== NAMESPACE) return undefined
  if (!e.key || !e.creator || e.expiresAt === undefined) return undefined
  const base = {
    key: e.key,
    creator: e.creator.toLowerCase() as Address,
    owner: (e.owner ?? e.creator).toLowerCase() as Address,
    createdAtBlock: e.createdAt ?? 0n,
    expiresAtBlock: e.expiresAt,
  }
  const p = payloadJson(e)
  switch (s(attrs, "type")) {
    case "project": {
      const publisher = s(attrs, "publisher")
      if (!publisher) return undefined
      const revokes = s(attrs, "revokes")
      return {
        ...base,
        entity: "project",
        slug: s(attrs, "project_slug") ?? "",
        name: text(p.name),
        publisher: publisher.toLowerCase() as Address,
        revokes: revokes ? (revokes.toLowerCase() as Address) : undefined,
        anchors: Array.isArray(p.anchors) ? (p.anchors as Anchor[]).filter((a) => a && typeof a.ref === "string") : [],
      }
    }
    case "endpoint": {
      const targetHash = s(attrs, "target_hash")
      if (!targetHash) return undefined
      return {
        ...base,
        entity: "endpoint",
        targetHash: targetHash.toLowerCase() as Hex,
        target: text(p.target),
        targetKind: (s(attrs, "kind") ?? "web") as TargetKind,
        projectSlug: s(attrs, "project_slug") ?? "",
        label: text(p.label),
        ...(p.retiring === true && { retiring: true }),
      }
    }
    case "incident": {
      const targetHash = s(attrs, "target_hash")
      if (!targetHash) return undefined
      return {
        ...base,
        entity: "incident",
        targetHash: targetHash.toLowerCase() as Hex,
        severity: Number(attrs.severity?.value ?? 0),
        title: text(p.title),
        advice: text(p.advice),
        projectSlug: s(attrs, "project_slug") ?? "",
      }
    }
    default:
      return undefined
  }
}
