// Repro: docs say `*` matches every entity, but the SDK query builder refuses a query without a filter.
import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { http } from "viem"

const client = createPublicClient({ chain: tiramisu, transport: http(undefined, { retryCount: 0 }) })
console.log("sdk", (await import("@arkiv-network/sdk/package.json", { with: { type: "json" } })).default.version)
try {
  const r = await client.select({ key: true }).limit(1).fetch()
  console.log("OK: no-filter query returned", r.entities.length, "entities")
} catch (e) {
  console.log(`${(e as Error).name}: ${(e as Error).message}`)
}
console.log("entity count via getEntityCount():", await client.getEntityCount())
