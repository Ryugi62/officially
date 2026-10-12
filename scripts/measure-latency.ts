// Times end-to-end checks against the public Tiramisu RPC (no key). Small n on purpose: the anonymous RPC budget is per IP.
import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { http } from "viem"
import { ArkivReader } from "../src/adapters/arkiv/reader"
import { checkTarget } from "../src/application/check-target"
import { checkTransaction } from "../src/application/check-transaction"
import { DEMO } from "../src/infrastructure/demo"

const n = Number(process.argv[2] ?? 10)
let calls = 0
const transport = http(undefined, { retryCount: 0, onFetchRequest: () => { calls++ } })
const reader = new ArkivReader(createPublicClient({ chain: tiramisu, transport }))
const pin = { rootKey: DEMO.rootKey }
const data = "0x095ea7b3" + DEMO.router.slice(2).padStart(64, "0") + "f".repeat(64)
const times: number[] = []
const perCheck: number[] = []
for (let i = 0; i < n; i++) {
  const before = calls, t = performance.now()
  if (i % 2) await checkTarget(reader, { raw: DEMO.origin, pin })
  else await checkTransaction(reader, { request: { to: DEMO.token, data, chainId: DEMO.chainId }, origin: DEMO.origin, pin })
  times.push(performance.now() - t)
  perCheck.push(calls - before)
}
times.sort((a, b) => a - b)
const q = (p: number) => Math.round(times[Math.min(times.length - 1, Math.floor(p * times.length))]!)
console.log(JSON.stringify({ n, p50_ms: q(0.5), p90_ms: q(0.9), max_ms: q(1), rpc_requests_per_check_max: Math.max(...perCheck), at: new Date().toISOString() }))
