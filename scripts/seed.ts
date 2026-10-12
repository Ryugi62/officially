// Seeds the synthetic "Demo Swap" project on Tiramisu. Keys come from the environment only:
//   OFFICIALLY_ROOT_KEY, OFFICIALLY_PUBLISHER_KEY, OFFICIALLY_ATTACKER_KEY (a key that pretends to be Demo Swap)
// Writes src/infrastructure/demo.ts addresses and prints every tx hash for /arkiv/evidence.md.
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { ArkivReader } from "../src/adapters/arkiv/reader"
import { ArkivWriter } from "../src/adapters/arkiv/writer"
import { publishEndpoints, raiseIncident, rotatePublisher } from "../src/application/writes"
import { DEMO } from "../src/infrastructure/demo"

const transport = http(undefined, { retryCount: 0 })
const pub = createPublicClient({ chain: tiramisu, transport })
function w(env: string) {
  const k = process.env[env]
  if (!k) throw new Error(`${env} missing`)
  return new ArkivWriter(createWalletClient({ chain: tiramisu, transport, account: privateKeyToAccount(k as `0x${string}`) }), pub)
}
const root = w("OFFICIALLY_ROOT_KEY"), publisher = w("OFFICIALLY_PUBLISHER_KEY"), attacker = w("OFFICIALLY_ATTACKER_KEY")
const log = (step: string, r: unknown) => console.log(step, JSON.stringify(r, (_, v) => (typeof v === "bigint" ? v.toString() : v)))

const existing = (await new ArkivReader(pub).findProjectRecords(root.address)).filter((r) => r.publisher.toLowerCase() === publisher.address.toLowerCase())
if (existing.length) log("1 root record already live", { key: existing[0]!.key })
else log("1 root names publisher", await rotatePublisher(root, new ArkivReader(pub), {
  newPublisher: publisher.address, slug: DEMO.slug, name: DEMO.name,
  anchors: [{ kind: "github", ref: "https://github.com/Ryugi62/officially/blob/main/demo/.well-known/officially.json" }],
}))
log("2 publisher publishes endpoints", await publishEndpoints(publisher, {
  projectSlug: DEMO.slug,
  endpoints: [
    { raw: DEMO.origin, label: "App" },
    { raw: `eip155:${DEMO.chainId}:${DEMO.token}`, label: "USDC (demo) token" },
    { raw: `eip155:${DEMO.chainId}:${DEMO.router}`, label: "Swap router" },
    { raw: "@demoswap_ex", label: "X account" },
  ],
}))
// Scheduled retirements inside the judging window (19–23 Oct): judges can watch these lapse on their own.
const until = (iso: string) => { const s = Math.floor((Date.parse(iso) - Date.now()) / 1000); return s - (s % 2) }
log("2b publisher schedules retirements", await publishEndpoints(publisher, {
  projectSlug: DEMO.slug,
  endpoints: [
    { raw: "https://v1.demo-swap.example", label: "v1 app (retires 20 Oct)", retireInSeconds: until("2026-10-20T12:00:00Z") },
    { raw: `eip155:${DEMO.chainId}:0x5eed00000000000000000000000000000000a110`, label: "Router v1 (retires 21 Oct)", retireInSeconds: until("2026-10-21T12:00:00Z") },
    { raw: "https://beta.demo-swap.example", label: "Beta app (retires 22 Oct)", retireInSeconds: until("2026-10-22T12:00:00Z") },
  ],
}))
log("3 attacker forges a claim for its drainer under the same name", await publishEndpoints(attacker, {
  projectSlug: DEMO.slug,
  endpoints: [{ raw: `eip155:${DEMO.chainId}:${DEMO.drainer}`, label: "Swap router v2" }],
}))
if (process.argv.includes("--incident")) {
  log("4 publisher raises an incident on a retired frontend", await raiseIncident(publisher, {
    raw: "https://old.demo-swap.example", severity: 2, title: "Retired frontend", advice: "This old frontend is no longer maintained. Do not sign there.", projectSlug: DEMO.slug,
  }))
}
console.log("root", root.address, "publisher", publisher.address, "attacker", attacker.address, "block", await pub.getBlockNumber())
