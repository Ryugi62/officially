// Physical test of UC-7: subscribe over WebSocket (no fromBlock), raise an incident from the publisher, time the push.
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { ArkivIncidentFeed, createFeedClient } from "../../src/adapters/arkiv/feed"
import { ArkivWriter } from "../../src/adapters/arkiv/writer"
import { raiseIncident } from "../../src/application/writes"
import { DEMO } from "../../src/infrastructure/demo"

const transport = http(undefined, { retryCount: 0 })
const pub = createPublicClient({ chain: tiramisu, transport })
const ws = createFeedClient()
console.log("feed transport:", ws.transport.type)
const feed = new ArkivIncidentFeed(ws, async (key) => {
  const e = await pub.getEntity(key)
  return e.creator ? { type: String((e.attributes as Record<string, { value?: unknown }>)?.type?.value), creator: e.creator } : undefined
}, (e) => console.log("feed error:", e.message))
let sentAt = 0
const got = new Promise<string>((resolve) => feed.subscribe([DEMO.rootKey, DEMO.publisher], (k) => resolve(k)))
await new Promise((r) => setTimeout(r, 2000))
const w = new ArkivWriter(createWalletClient({ chain: tiramisu, transport, account: privateKeyToAccount(process.env.OFFICIALLY_PUBLISHER_KEY as `0x${string}`) }), pub)
sentAt = Date.now()
const r = await raiseIncident(w, { raw: process.argv[2] ?? "https://demo-swap-airdrop.example", severity: 3, title: "Fake airdrop site", advice: "This site impersonates Demo Swap. We run no airdrop. Do not connect a wallet.", projectSlug: DEMO.slug })
const minedAt = Date.now()
console.log("incident", r.key, "tx", r.txHash, "write resolved after", minedAt - sentAt, "ms")
const key = await Promise.race([got, new Promise<string>((_, rej) => setTimeout(() => rej(new Error("no event within 60 s")), 60_000))])
console.log("pushed event for", key, key === r.key ? "(matches)" : "(different key!)", "after", Date.now() - sentAt, "ms from send,", Date.now() - minedAt, "ms after the write resolved")
process.exit(0)
