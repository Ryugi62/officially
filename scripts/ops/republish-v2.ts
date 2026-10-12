// After the rotation: the new publisher re-publishes Demo Swap's endpoints (same targets, same scheduled retirements).
// The docs endpoint is deliberately NOT re-published, so it keeps showing REVOKED (signed only by the retired key).
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { ArkivWriter } from "../../src/adapters/arkiv/writer"
import { publishEndpoints } from "../../src/application/writes"
import { DEMO } from "../../src/infrastructure/demo"
const transport = http(undefined, { retryCount: 0 })
const pub = createPublicClient({ chain: tiramisu, transport })
const w = new ArkivWriter(createWalletClient({ chain: tiramisu, transport, account: privateKeyToAccount(process.env.OFFICIALLY_PUBLISHER_KEY as `0x${string}`) }), pub)
const until = (iso: string) => { const s = Math.floor((Date.parse(iso) - Date.now()) / 1000); return s - (s % 2) }
const r = await publishEndpoints(w, {
  projectSlug: DEMO.slug,
  endpoints: [
    { raw: DEMO.origin, label: "App" },
    { raw: `eip155:${DEMO.chainId}:${DEMO.token}`, label: "USDC (demo) token" },
    { raw: `eip155:${DEMO.chainId}:${DEMO.router}`, label: "Swap router" },
    { raw: "@demoswap_ex", label: "X account" },
    { raw: "https://v1.demo-swap.example", label: "v1 app (retires 20 Oct)", retireInSeconds: until("2026-10-20T12:00:00Z") },
    { raw: `eip155:${DEMO.chainId}:0x5eed00000000000000000000000000000000a110`, label: "Router v1 (retires 21 Oct)", retireInSeconds: until("2026-10-21T12:00:00Z") },
    { raw: "https://beta.demo-swap.example", label: "Beta app (retires 22 Oct)", retireInSeconds: until("2026-10-22T12:00:00Z") },
  ],
})
console.log("publisher", w.address, "republished", JSON.stringify(r))
