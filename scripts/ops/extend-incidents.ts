// Keep-alive for the judging window (permissionless extension, signed by the community key, testnet only).
// Extends every live incident that would lapse before the target date so that it lives until the target date.
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

const PUBLISHER = "0x04a16DA7180594eF2dFFcF70431e809432CE438F"
const target = Date.parse(process.argv[2] ?? "2026-10-25T00:00:00Z")
const transport = http(undefined, { retryCount: 0 })
const pub = createPublicClient({ chain: tiramisu, transport })
const w = createWalletClient({ chain: tiramisu, transport, account: privateKeyToAccount(process.env.OFFICIALLY_COMMUNITY_KEY as `0x${string}`) })
const r = await pub.select().where(and(eq("app", str(NAMESPACE)))).createdBy(PUBLISHER).limit(200).fetch()
const head = r.blockNumber
for (const e of r.entities) {
  const d = fromSdkEntity(e)
  if (!d || d.entity !== "incident") continue
  const at = Date.now() + Number(d.expiresAtBlock - head) * 2000
  if (at >= target) { console.log(d.key.slice(0, 12), "already ok until", new Date(at).toISOString()); continue }
  const seconds = Math.ceil((target - Date.now()) / 2000) * 2
  const res = await w.extendEntity({ entityKey: d.key as `0x${string}`, expires: ExpirationTime.fromSeconds(seconds) })
  console.log(d.key, "extended tx", res.txHash, "expiresAt block", d.expiresAtBlock, "->", res.expiresAt)
}
