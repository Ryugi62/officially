// Read-only. Lists every officially.v1 entity created by the demo keys with its real Entity Expiration block,
// converts it to a date from the live block height (2 s blocks), and flags what lapses before 24 Oct 2026
// (judging runs 19-22 Oct). Short-lived entities are meant to be: incidents (24 h / 72 h / 7 d) and endpoints
// published with a scheduled retirement. Usage: npx tsx scripts/repro/expiry-check.ts
import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { str } from "@arkiv-network/sdk/attr"
import { and, eq } from "@arkiv-network/sdk/query"
import { http } from "viem"
import { fromSdkEntity } from "../../src/adapters/arkiv/codec"
import { NAMESPACE } from "../../src/domain/contract"

const KEYS = [
  "0x70E5d4986A251a5173Acf59c86178e144B62864E",
  "0x7169173d0D00db282f385FEE8BeCe2D67d10c6f0",
  "0x04a16DA7180594eF2dFFcF70431e809432CE438F",
  "0xcb7074f79E887426Eba3aE9039F0b2ed620a8d6e",
] as const
const CUTOFF = Date.parse("2026-10-24T00:00:00Z")
const c = createPublicClient({ chain: tiramisu, transport: http(undefined, { retryCount: 0 }) })
const rows: { type: string; key: string; what: string; at: number; block: bigint }[] = []
let head = 0n
for (const k of KEYS) {
  let cursor: string | undefined
  do {
    let q = c.select().where(and(eq("app", str(NAMESPACE)))).createdBy(k).limit(200)
    if (cursor) q = q.cursor(cursor)
    const r = await q.fetch()
    head = r.blockNumber
    const now = Date.now()
    for (const e of r.entities) {
      const d = fromSdkEntity(e)
      if (!d) continue
      const what = d.entity === "project" ? "project record" : d.entity === "endpoint" ? `${d.target} (${d.label})` : `${d.title} sev${d.severity}`
      rows.push({ type: d.entity, key: d.key, what, at: now + Number(d.expiresAtBlock - head) * 2000, block: d.expiresAtBlock })
    }
    cursor = r.cursor
  } while (cursor)
}
rows.sort((a, b) => a.at - b.at)
console.log(`checked at ${new Date().toISOString()} · chain head block ${head} · ${rows.length} live entities`)
for (const r of rows) console.log(`${new Date(r.at).toISOString().slice(0, 16)}Z  block ${r.block}  ${r.type.padEnd(8)} ${r.key.slice(0, 12)}…  ${r.what}${r.at < CUTOFF ? "   << before 24 Oct" : ""}`)
const early = rows.filter((r) => r.at < CUTOFF)
console.log(`lapse before 24 Oct 2026: ${early.length} (${early.filter((r) => r.type === "incident").length} incidents, ${early.filter((r) => r.type === "endpoint").length} endpoints)`)
console.log(`lapse on/after 24 Oct 2026: ${rows.length - early.length}`)
