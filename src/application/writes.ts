import { CONTRACT, NAMESPACE, type EntityName } from "../domain/contract"
import { hashTarget, PROJECT_WIDE } from "../domain/hash"
import { BLOCK_SECONDS, BURN_ADDRESS, ENDPOINT_LEASE_SECONDS, incidentSeconds, PROJECT_RECORD_SECONDS } from "../domain/lifetimes"
import { assertNoSensitive } from "../domain/sensitive"
import { normalizeTarget } from "../domain/target"
import type { Address, Anchor, Hex } from "../domain/types"
import { emptyBatch, type AttestationReader, type AttestationWriter, type AttributeValue, type CreateSpec } from "./ports"

function attributes(entity: EntityName, values: Record<string, string | number | bigint | undefined>): AttributeValue[] {
  const types = CONTRACT.entities[entity].attributes as Record<string, AttributeValue["type"]>
  const out: AttributeValue[] = [
    { name: "app", type: "str", value: NAMESPACE },
    { name: "type", type: "str", value: entity },
  ]
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) continue
    const type = types[name]
    if (!type) throw new Error(`Attribute ${name} is not in the ${entity} contract`)
    out.push({ name, type, value })
  }
  return out
}

/** UC-2: publish official endpoints in one atomic, readonly batch with a 30-day lease. */
export async function publishEndpoints(
  writer: AttestationWriter,
  input: { projectSlug: string; endpoints: { raw: string; label: string; chainId?: number; retireInSeconds?: number }[] },
) {
  const creates: CreateSpec[] = input.endpoints.map((e) => {
    const target = normalizeTarget(e.raw, e.chainId === undefined ? {} : { chainId: e.chainId })
    const lease = e.retireInSeconds ?? ENDPOINT_LEASE_SECONDS
    if (lease > ENDPOINT_LEASE_SECONDS) throw new RangeError("A retiring endpoint cannot outlive the normal 30-day lease")
    if (lease <= 0 || lease % BLOCK_SECONDS !== 0) throw new RangeError("Retirement must be a whole number of 2-second blocks from now")
    return {
      entity: "endpoint",
      attributes: attributes("endpoint", { project_slug: input.projectSlug, kind: target.kind, target_hash: hashTarget(target) }),
      payload: { target: target.value, label: e.label, ...(e.retireInSeconds !== undefined && { retiring: true }) },
      expiresInSeconds: lease,
      flags: { readonly: true, permissionlessExtension: false },
    }
  })
  assertNoSensitive([input.projectSlug, ...input.endpoints.map((e) => e.label)])
  const res = await writer.submit({ ...emptyBatch(), creates })
  return { txHash: res.txHash, keys: res.created }
}

/** UC-3: renew every live claim of this publisher in one transaction (run it on every deploy). */
export async function renewLeases(writer: AttestationWriter, reader: AttestationReader) {
  const claims = (await reader.findClaimsByCreator(writer.address)).filter((c) => !c.retiring)
  if (claims.length === 0) return { renewed: 0 as const, txHash: undefined }
  const res = await writer.submit({
    ...emptyBatch(),
    extensions: claims.map((c) => ({ key: c.key, expiresInSeconds: ENDPOINT_LEASE_SECONDS })),
  })
  return { renewed: claims.length, txHash: res.txHash }
}

/** UC-4: create the incident and hand it to the burn address atomically — it can never exist in a deletable state. */
export async function raiseIncident(
  writer: AttestationWriter,
  input: { raw: string | undefined; chainId?: number; severity: number; title: string; advice: string; projectSlug: string },
) {
  if (!Number.isInteger(input.severity) || input.severity < 1 || input.severity > 3) throw new RangeError("severity must be 1, 2 or 3")
  assertNoSensitive([input.title, input.advice, input.projectSlug])
  const target = input.raw === undefined ? undefined : normalizeTarget(input.raw, input.chainId === undefined ? {} : { chainId: input.chainId })
  const [predicted] = await writer.predictKeys(1)
  if (!predicted) throw new Error("Could not predict the incident key")
  const res = await writer.submit({
    ...emptyBatch(),
    creates: [
      {
        entity: "incident",
        attributes: attributes("incident", {
          project_slug: input.projectSlug,
          target_hash: target ? hashTarget(target) : PROJECT_WIDE,
          severity: input.severity,
        }),
        payload: { target: target?.value ?? "*", title: input.title, advice: input.advice },
        expiresInSeconds: incidentSeconds(input.severity),
        flags: { readonly: true, permissionlessExtension: true },
        salt: predicted.salt,
      },
    ],
    ownershipChanges: [{ key: predicted.key, newOwner: BURN_ADDRESS }],
  })
  return { key: predicted.key, txHash: res.txHash, created: res.created }
}

/**
 * UC-5: anyone keeps a warning alive (permissionless extension). Lifetime Extension *sets* the lifetime from now,
 * so the incident is read first: its own severity decides the lifetime, and if that would not move the expiry
 * later, nothing is sent (the node would reject it anyway — see friction S3).
 */
export async function keepAlive(writer: AttestationWriter, input: { incidentKey: Hex }, reader: AttestationReader) {
  const [inc, now] = await Promise.all([reader.findIncident(input.incidentKey), reader.currentBlock()])
  if (!inc) throw new Error("No live incident with that key (expired, or not an incident)")
  const seconds = incidentSeconds(inc.severity)
  if (now + BigInt(seconds / BLOCK_SECONDS) <= inc.expiresAtBlock) return { extended: false as const, txHash: undefined }
  const res = await writer.submit({ ...emptyBatch(), extensions: [{ key: input.incidentKey, expiresInSeconds: seconds }] })
  return { extended: true as const, txHash: res.txHash }
}

/** UC-6: name a new publisher and drop the old record in one transaction — never zero, never two. */
export async function rotatePublisher(
  writer: AttestationWriter,
  reader: AttestationReader,
  input: { newPublisher: Address; slug: string; name: string; anchors: Anchor[]; compromisedSinceBlock?: bigint },
) {
  assertNoSensitive([input.slug, input.name, ...input.anchors.map((a) => a.ref)])
  const current = (await reader.findProjectRecords(writer.address)).filter((r) => r.creator.toLowerCase() === writer.address.toLowerCase())
  const previous = current.find((r) => r.publisher.toLowerCase() !== input.newPublisher.toLowerCase())?.publisher
  // History of retired keys with the block their warning power ended: what the current record revoked ends at that
  // record's creation (or the root's compromise estimate); the new record's own `revokes` ends at its creation block.
  const history = new Map<string, bigint>()
  for (const r of current) {
    for (const h of r.previousPublishers ?? []) history.set(h.address.toLowerCase(), h.retiredAtBlock)
    if (r.revokes) history.set(r.revokes.toLowerCase(), r.compromisedSinceBlock !== undefined && r.compromisedSinceBlock < r.createdAtBlock ? r.compromisedSinceBlock : r.createdAtBlock)
  }
  const previousPublishers = [...history].map(([address, b]) => ({ address, retiredAtBlock: b.toString() }))
  const res = await writer.submit({
    ...emptyBatch(),
    creates: [
      {
        entity: "project",
        attributes: attributes("project", { project_slug: input.slug, publisher: input.newPublisher, revokes: previous }),
        payload: {
          name: input.name, slug: input.slug, publisher: input.newPublisher, anchors: input.anchors,
          ...(previousPublishers.length && { previousPublishers }),
          ...(input.compromisedSinceBlock !== undefined && { compromisedSinceBlock: input.compromisedSinceBlock.toString() }),
        },
        expiresInSeconds: PROJECT_RECORD_SECONDS,
        flags: { readonly: true, permissionlessExtension: false },
      },
    ],
    deletes: current.map((r) => ({ key: r.key })),
  })
  return { txHash: res.txHash, key: res.created[0] }
}
