// Keep-alive for the judging window (permissionless extension, signed by the community key, testnet only).
// Extends every live incident and endpoint that would lapse before the target date so that it lives until the target date.
// Usage: OFFICIALLY_COMMUNITY_KEY=$(security find-generic-password -s officially-tiramisu-community -w) npx tsx scripts/ops/extend-incidents.ts [2026-10-25T00:00:00Z]
// Extension only ever lengthens a life; the node refuses a shortening (arkiv/repro-logs/shorten-incident.log).
import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { str } from "@arkiv-network/sdk/attr"
import { and, eq } from "@arkiv-network/sdk/query"
import { http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { fromSdkEntity } from "../../src/adapters/arkiv/codec"
import { NAMESPACE } from "../../src/domain/contract"

// OFFICIALLY_CREATED_BY selects the owner whose entities are scanned (default: publisher; older retiring endpoints belong to publisher2 0x7169…)
const PUBLISHER = (process.env.OFFICIALLY_CREATED_BY ?? "0x04a16DA7180594eF2dFFcF70431e809432CE438F") as `0x${string}`
const target = Date.parse(process.argv[2] ?? "2026-10-25T00:00:00Z")
const transport = http(undefined, { retryCount: 0 })
const pub = createPublicClient({ chain: tiramisu, transport })
// incidents: anyone may extend (community key). endpoints: only the owner may (publisher key).
const wallet = (k?: string) => createWalletClient({ chain: tiramisu, transport, account: privateKeyToAccount(k as `0x${string}`) })
const wCommunity = process.env.OFFICIALLY_COMMUNITY_KEY ? wallet(process.env.OFFICIALLY_COMMUNITY_KEY) : undefined
const wPublisher = process.env.OFFICIALLY_PUBLISHER_KEY ? wallet(process.env.OFFICIALLY_PUBLISHER_KEY) : undefined
const r = await pub.select().where(and(eq("app", str(NAMESPACE)))).createdBy(PUBLISHER).limit(200).fetch()
const head = r.blockNumber
for (const e of r.entities) {
  const d = fromSdkEntity(e)
  if (!d || (d.entity !== "incident" && d.entity !== "endpoint")) continue // endpoints with a scheduled retirement are extended too (judging window)
  const at = Date.now() + Number(d.expiresAtBlock - head) * 2000
  if (at >= target) { console.log(d.key.slice(0, 12), "already ok until", new Date(at).toISOString()); continue }
  const seconds = Math.ceil((target - Date.now()) / 2000) * 2
  const w = d.entity === "incident" ? wCommunity : wPublisher
  if (!w) { console.log(d.key.slice(0, 12), d.entity, "needs", d.entity === "incident" ? "OFFICIALLY_COMMUNITY_KEY" : "OFFICIALLY_PUBLISHER_KEY"); continue }
  const res = await w.extendEntity({ entityKey: d.key as `0x${string}`, expires: ExpirationTime.fromSeconds(seconds) })
  console.log(d.key, "extended tx", res.txHash, "expiresAt block", d.expiresAtBlock, "->", res.expiresAt)
}
