// AC-15 (Open Source pillar): a client written only from /arkiv/schema.md, importing nothing from src/,
// reaches the same verdict as the app's engine on the same data.
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
// @ts-expect-error — plain JS example on purpose
import { normalize, targetHash, verdictFromRaw } from "../../examples/independent-check.mjs"
import { decideVerdict } from "../../src/domain/verdict"
import { hashTarget, PROJECT_WIDE } from "../../src/domain/hash"
import { normalizeTarget } from "../../src/domain/target"
import { claim, EVIL, incident, PUB_A, PUB_B, record, ROOT } from "../fixtures"
import type { EndpointClaim, Incident, ProjectRecord } from "../../src/domain/types"

const NOW = 200_000n
const hx = (b: bigint) => "0x" + b.toString(16)
function toRaw(x: ProjectRecord | EndpointClaim | Incident) {
  const a = (name: string, type: string, value: unknown) => ({ name, type, value })
  const attrs = [a("app", "str", "officially.v1"), a("type", "str", x.entity)]
  if (x.entity === "project") { attrs.push(a("publisher", "addr", x.publisher)); if (x.revokes) attrs.push(a("revokes", "addr", x.revokes)) }
  else attrs.push(a("target_hash", "bytes32", x.targetHash))
  return { key: x.key, creator: x.creator, createdAt: hx(x.createdAtBlock), expiresAt: hx(x.expiresAtBlock), attributes: attrs }
}

describe("independent client agrees with the app (data contract)", () => {
  it("imports nothing from src/", () => {
    const src = readFileSync(new URL("../../examples/independent-check.mjs", import.meta.url), "utf8")
    expect(src).not.toMatch(/from ["']\.\.\/src|from ["']\.\/src|@arkiv-network/)
  })
  it("normalizes and hashes exactly like the app", () => {
    for (const raw of ["HTTPS://App.Demo-Swap.example/x?y=1", "eip155:1:0xAbCdEf0123456789abcdef0123456789ABCDEF01"]) {
      expect(targetHash(normalize(raw))).toBe(hashTarget(normalizeTarget(raw)))
    }
  })
  const H = hashTarget("https://app.demo-swap.example")
  const scenarios: [string, (ProjectRecord | EndpointClaim | Incident)[]][] = [
    ["official", [record({ publisher: PUB_A }), claim({ targetHash: H, creator: PUB_A })]],
    ["probation", [record({ publisher: PUB_A }), claim({ targetHash: H, creator: PUB_A, createdAtBlock: NOW - 10n })]],
    ["forged", [record({ publisher: PUB_A }), claim({ targetHash: H, creator: EVIL })]],
    ["incident", [record({ publisher: PUB_A }), claim({ targetHash: H, creator: PUB_A }), incident({ targetHash: PROJECT_WIDE, creator: ROOT })]],
    ["untrusted incident", [record({ publisher: PUB_A }), claim({ targetHash: H, creator: PUB_A }), incident({ targetHash: H, creator: EVIL })]],
    ["revoked", [record({ publisher: PUB_B, revokes: PUB_A }), claim({ targetHash: H, creator: PUB_A })]],
    ["unlisted", [record({ publisher: PUB_A })]],
    ["lapsed", [record({ publisher: PUB_A }), claim({ targetHash: H, creator: PUB_A, expiresAtBlock: NOW })]],
  ]
  for (const [name, xs] of scenarios) {
    it(name, () => {
      const app = decideVerdict({
        targetHash: H, currentBlock: NOW, pin: { rootKey: ROOT },
        projectRecords: xs.filter((x): x is ProjectRecord => x.entity === "project"),
        claims: xs.filter((x): x is EndpointClaim => x.entity === "endpoint"),
        incidents: xs.filter((x): x is Incident => x.entity === "incident"),
      }).status
      expect(verdictFromRaw({ rows: xs.map(toRaw), root: ROOT, hash: H, block: NOW })).toBe(app)
    })
  }
})
