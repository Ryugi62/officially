// UC-2..UC-6, AC-10..AC-12, AC-16
import { describe, expect, it } from "vitest"
import { publishEndpoints, renewLeases, raiseIncident, keepAlive, rotatePublisher } from "../../src/application/writes"
import { BURN_ADDRESS, ENDPOINT_LEASE_SECONDS, INCIDENT_SECONDS } from "../../src/domain/lifetimes"
import { hashTarget, PROJECT_WIDE } from "../../src/domain/hash"
import { normalizeTarget } from "../../src/domain/target"
import { SensitiveDataError } from "../../src/domain/sensitive"
import { claim, PUB_A, PUB_B, record, ROOT } from "../fixtures"
import { FakeReader, FakeWriter } from "./fakes"

const attr = (spec: { attributes: { name: string; value: unknown }[] }, name: string) =>
  spec.attributes.find((a) => a.name === name)?.value

describe("publishEndpoints (UC-2)", () => {
  it("writes every target in one readonly batch with a 30-day lease and the target hash", async () => {
    const w = new FakeWriter(PUB_A)
    await publishEndpoints(w, {
      projectSlug: "demo-swap",
      endpoints: [
        { raw: "https://app.demo-swap.example", label: "App" },
        { raw: "@demoswap", label: "X account" },
      ],
    })
    expect(w.batches).toHaveLength(1)
    const [b] = w.batches
    expect(b!.creates).toHaveLength(2)
    for (const c of b!.creates) {
      expect(c.flags).toEqual({ readonly: true, permissionlessExtension: false })
      expect(c.expiresInSeconds).toBe(ENDPOINT_LEASE_SECONDS)
      expect(attr(c, "type")).toBe("endpoint")
    }
    expect(attr(b!.creates[0]!, "target_hash")).toBe(hashTarget(normalizeTarget("https://app.demo-swap.example")))
  })
  it("AC-16 refuses a payload that contains a private-key-shaped string", async () => {
    const w = new FakeWriter(PUB_A)
    await expect(
      publishEndpoints(w, {
        projectSlug: "demo-swap",
        endpoints: [{ raw: "https://app.demo-swap.example", label: "0x" + "ab".repeat(32) }],
      }),
    ).rejects.toThrow(SensitiveDataError)
    expect(w.batches).toHaveLength(0)
  })
  it("AC-16 refuses an email address in a label", async () => {
    const w = new FakeWriter(PUB_A)
    await expect(
      publishEndpoints(w, { projectSlug: "demo-swap", endpoints: [{ raw: "https://a.example", label: "ops@demo.example" }] }),
    ).rejects.toThrow(SensitiveDataError)
  })
})

describe("renewLeases (UC-3, AC-12)", () => {
  it("extends every live claim of the publisher in one transaction", async () => {
    const w = new FakeWriter(PUB_A)
    const h = hashTarget(normalizeTarget("https://a.example"))
    const reader = new FakeReader([], [claim({ targetHash: h, creator: PUB_A }), claim({ targetHash: h, creator: PUB_A })])
    const r = await renewLeases(w, reader)
    expect(w.batches).toHaveLength(1)
    expect(w.batches[0]!.extensions).toHaveLength(2)
    expect(w.batches[0]!.extensions.every((e) => e.expiresInSeconds === ENDPOINT_LEASE_SECONDS)).toBe(true)
    expect(r.renewed).toBe(2)
  })
  it("sends nothing when the publisher has no live claims", async () => {
    const w = new FakeWriter(PUB_A)
    const r = await renewLeases(w, new FakeReader())
    expect(w.batches).toHaveLength(0)
    expect(r.renewed).toBe(0)
  })
})

describe("raiseIncident (UC-4, AC-10)", () => {
  it("creates and burns the incident in one batch using the predicted key and salt", async () => {
    const w = new FakeWriter(PUB_A)
    const out = await raiseIncident(w, {
      raw: "https://app.demo-swap.example",
      severity: 3,
      title: "DNS hijacked",
      advice: "Do not sign anything on this domain.",
      projectSlug: "demo-swap",
    })
    expect(w.batches).toHaveLength(1)
    const b = w.batches[0]!
    expect(b.creates).toHaveLength(1)
    const c = b.creates[0]!
    expect(c.flags).toEqual({ readonly: true, permissionlessExtension: true })
    expect(c.expiresInSeconds).toBe(INCIDENT_SECONDS)
    const [predicted] = await w.predictKeys(1)
    expect(c.salt).toBe(predicted!.salt)
    expect(b.ownershipChanges).toEqual([{ key: predicted!.key, newOwner: BURN_ADDRESS }])
    expect(out.key).toBe(predicted!.key)
    expect(attr(c, "severity")).toBe(3)
  })
  it("uses the project-wide hash when no target is given", async () => {
    const w = new FakeWriter(ROOT)
    await raiseIncident(w, { raw: undefined, severity: 3, title: "Keys rotated", advice: "Wait.", projectSlug: "demo-swap" })
    expect(attr(w.batches[0]!.creates[0]!, "target_hash")).toBe(PROJECT_WIDE)
  })
  it("rejects a severity outside 1..3", async () => {
    const w = new FakeWriter(PUB_A)
    await expect(raiseIncident(w, { raw: undefined, severity: 7, title: "x", advice: "y", projectSlug: "s" })).rejects.toThrow()
  })
})

describe("keepAlive (UC-5)", () => {
  it("extends an incident by any wallet with the incident lifetime", async () => {
    const w = new FakeWriter(PUB_B)
    const key = ("0x" + "1".repeat(64)) as `0x${string}`
    await keepAlive(w, { incidentKey: key })
    expect(w.batches[0]!.extensions).toEqual([{ key, expiresInSeconds: INCIDENT_SECONDS }])
  })
})

describe("rotatePublisher (UC-6, AC-11)", () => {
  it("creates the new record and deletes the old one in one transaction", async () => {
    const w = new FakeWriter(ROOT)
    const old = record({ publisher: PUB_A })
    const reader = new FakeReader([old])
    await rotatePublisher(w, reader, { newPublisher: PUB_B, slug: "demo-swap", name: "Demo Swap (synthetic)", anchors: [] })
    expect(w.batches).toHaveLength(1)
    const b = w.batches[0]!
    expect(b.creates).toHaveLength(1)
    expect(b.deletes).toEqual([{ key: old.key }])
    expect(attr(b.creates[0]!, "publisher")).toBe(PUB_B)
    expect(attr(b.creates[0]!, "revokes")).toBe(PUB_A)
  })
  it("registers a first record without deletes", async () => {
    const w = new FakeWriter(ROOT)
    await rotatePublisher(w, new FakeReader(), { newPublisher: PUB_A, slug: "demo-swap", name: "Demo", anchors: [] })
    expect(w.batches[0]!.deletes).toEqual([])
    expect(attr(w.batches[0]!.creates[0]!, "revokes")).toBeUndefined()
  })
})
