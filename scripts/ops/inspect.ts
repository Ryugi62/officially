import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { http } from "viem"
const c = createPublicClient({ chain: tiramisu, transport: http(undefined, { retryCount: 0 }) })
for (const k of process.argv.slice(2)) {
  const e = await c.getEntity(k as `0x${string}`)
  console.log(k.slice(0, 10), "creator", e.creator, "owner", e.owner, "expiresAt", e.expiresAt, "flags", JSON.stringify(e.creationFlags), "type", (e.attributes as any)?.type?.value)
}
console.log("block", await c.getBlockNumber())
