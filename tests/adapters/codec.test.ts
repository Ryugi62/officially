// Arkiv adapter mapping: domain write specs → SDK params, SDK entities → domain (no network)
import { describe, expect, it } from "vitest"
import { Entity } from "@arkiv-network/sdk"
import { addr, bytes32, i32, str } from "@arkiv-network/sdk/attr"
import { toSdkBatch, fromSdkEntity } from "../../src/adapters/arkiv/codec"
import { NAMESPACE } from "../../src/domain/contract"
import { hashTarget } from "../../src/domain/hash"
import { BURN_ADDRESS, INCIDENT_SECONDS } from "../../src/domain/lifetimes"
import { PUB_A, ROOT } from "../fixtures"

const H = hashTarget("https://app.demo-swap.example")
const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o))

describe("toSdkBatch", () => {
  it("maps typed attributes, flags, salt, expiry and ownership changes", () => {
    const sdk = toSdkBatch({
      creates: [
        {
          entity: "incident",
          attributes: [
            { name: "app", type: "str", value: NAMESPACE },
            { name: "type", type: "str", value: "incident" },
            { name: "target_hash", type: "bytes32", value: H },
            { name: "severity", type: "i32", value: 3 },
          ],
          payload: { title: "t" },
          expiresInSeconds: INCIDENT_SECONDS,
          flags: { readonly: true, permissionlessExtension: true },
          salt: 42n,
        },
      ],
      extensions: [],
      ownershipChanges: [{ key: ("0x" + "1".repeat(64)) as `0x${string}`, newOwner: BURN_ADDRESS }],
      deletes: [],
    })
    const c = sdk.creates![0]!
    expect(c.attributes).toEqual({ app: str(NAMESPACE), type: str("incident"), target_hash: bytes32(H), severity: i32(3) })
    expect(c.flags).toEqual({ readonly: true, permissionlessExtension: true })
    expect(c.salt).toBe(42n)
    expect(c.contentType).toBe("application/json")
    expect(JSON.parse(new TextDecoder().decode(c.payload))).toEqual({ title: "t" })
    expect(sdk.ownershipChanges).toEqual([{ entityKey: "0x" + "1".repeat(64), newOwner: BURN_ADDRESS }])
  })
  it("rejects a lifetime that is not a whole number of 2-second blocks before sending", () => {
    expect(() =>
      toSdkBatch({ creates: [], extensions: [{ key: ("0x" + "1".repeat(64)) as `0x${string}`, expiresInSeconds: 7 }], ownershipChanges: [], deletes: [] }),
    ).toThrow(/2-second/)
  })
})

describe("fromSdkEntity", () => {
  it("reads an endpoint claim, taking trust fields from the system attributes", () => {
    const e = new Entity({
      key: ("0x" + "a".repeat(64)) as `0x${string}`,
      creator: PUB_A,
      owner: PUB_A,
      createdAt: 10n,
      expiresAt: 99n,
      contentType: "application/json",
      payload: enc({ target: "https://app.demo-swap.example", label: "App" }),
      attributes: { app: str(NAMESPACE), type: str("endpoint"), project_slug: str("demo-swap"), kind: str("web"), target_hash: bytes32(H) },
    })
    const c = fromSdkEntity(e)
    expect(c).toMatchObject({ entity: "endpoint", creator: PUB_A, targetHash: H, expiresAtBlock: 99n, label: "App", targetKind: "web" })
  })
  it("reads a project record with its publisher and revoked key", () => {
    const e = new Entity({
      key: ("0x" + "b".repeat(64)) as `0x${string}`,
      creator: ROOT, owner: ROOT, createdAt: 1n, expiresAt: 1000n,
      contentType: "application/json",
      payload: enc({ name: "Demo", slug: "demo-swap", anchors: [{ kind: "github", ref: "https://github.com/x/y" }] }),
      attributes: { app: str(NAMESPACE), type: str("project"), project_slug: str("demo-swap"), publisher: addr(PUB_A), revokes: addr(ROOT) },
    })
    const r = fromSdkEntity(e)
    expect(r).toMatchObject({ entity: "project", publisher: PUB_A.toLowerCase(), revokes: ROOT.toLowerCase(), name: "Demo" })
  })
  it("ignores entities from other namespaces or with a broken payload", () => {
    expect(fromSdkEntity(new Entity({ attributes: { app: str("other"), type: str("endpoint") } }))).toBeUndefined()
    const broken = new Entity({
      key: ("0x" + "c".repeat(64)) as `0x${string}`, creator: PUB_A, owner: PUB_A, createdAt: 1n, expiresAt: 2n,
      payload: new TextEncoder().encode("{not json"),
      attributes: { app: str(NAMESPACE), type: str("endpoint"), target_hash: bytes32(H), kind: str("web"), project_slug: str("x") },
    })
    expect(fromSdkEntity(broken)).toMatchObject({ entity: "endpoint", label: "", target: "" })
  })
})

describe("fromSdkEntity fails closed", () => {
  it("drops an endpoint claim without $createdAt (probation cannot be decided)", () => {
    const e = new Entity({
      key: ("0x" + "d".repeat(64)) as `0x${string}`, creator: PUB_A, owner: PUB_A, expiresAt: 99n,
      payload: enc({ target: "https://app.demo-swap.example", label: "App" }),
      attributes: { app: str(NAMESPACE), type: str("endpoint"), project_slug: str("demo-swap"), kind: str("web"), target_hash: bytes32(H) },
    })
    expect(fromSdkEntity(e)).toBeUndefined()
  })
  it("reads the publisher history of a project record", () => {
    const e = new Entity({
      key: ("0x" + "e".repeat(64)) as `0x${string}`, creator: ROOT, owner: ROOT, createdAt: 1n, expiresAt: 1000n,
      payload: enc({ name: "Demo", previousPublishers: [{ address: PUB_A, retiredAtBlock: "123" }, { address: "not-an-address", retiredAtBlock: "1" }], compromisedSinceBlock: "99" }),
      attributes: { app: str(NAMESPACE), type: str("project"), project_slug: str("demo-swap"), publisher: addr(ROOT) },
    })
    expect(fromSdkEntity(e)).toMatchObject({ previousPublishers: [{ address: PUB_A.toLowerCase(), retiredAtBlock: 123n }], compromisedSinceBlock: 99n })
  })
})
