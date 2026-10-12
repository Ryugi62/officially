// Deletes retiring endpoint claims that a stale CLI build renewed by mistake, and re-publishes them with their scheduled retirement (one batch each step).
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { ArkivReader } from "../../src/adapters/arkiv/reader"
import { ArkivWriter } from "../../src/adapters/arkiv/writer"
import { emptyBatch } from "../../src/application/ports"
import { publishEndpoints } from "../../src/application/writes"
import { DEMO } from "../../src/infrastructure/demo"

const transport = http(undefined, { retryCount: 0 })
const pub = createPublicClient({ chain: tiramisu, transport })
const w = new ArkivWriter(createWalletClient({ chain: tiramisu, transport, account: privateKeyToAccount(process.env.OFFICIALLY_PUBLISHER_KEY as `0x${string}`) }), pub)
const retiring = (await new ArkivReader(pub).findClaimsByCreator(w.address)).filter((c) => c.retiring)
console.log("retiring claims found", retiring.map((c) => `${c.key.slice(0, 10)} ${c.target} exp ${c.expiresAtBlock}`))
if (retiring.length) console.log("delete", (await w.submit({ ...emptyBatch(), deletes: retiring.map((c) => ({ key: c.key })) })).txHash)
const until = (iso: string) => { const s = Math.floor((Date.parse(iso) - Date.now()) / 1000); return s - (s % 2) }
const r = await publishEndpoints(w, {
  projectSlug: DEMO.slug,
  endpoints: [
    { raw: "https://v1.demo-swap.example", label: "v1 app (retires 20 Oct)", retireInSeconds: until("2026-10-20T12:00:00Z") },
    { raw: `eip155:${DEMO.chainId}:0x5eed00000000000000000000000000000000a110`, label: "Router v1 (retires 21 Oct)", retireInSeconds: until("2026-10-21T12:00:00Z") },
    { raw: "https://beta.demo-swap.example", label: "Beta app (retires 22 Oct)", retireInSeconds: until("2026-10-22T12:00:00Z") },
  ],
})
console.log("republished", JSON.stringify(r))
