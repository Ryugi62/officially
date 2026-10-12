// Repro: can the query builder filter on system attributes ($creator, $owner, $createdAt, $expiresAt)?
import { createPublicClient } from "@arkiv-network/sdk"
import { addr, u64 } from "@arkiv-network/sdk/attr"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { and, eq, gt, or, render, type Expression } from "@arkiv-network/sdk/query"
import { http } from "viem"

const client = createPublicClient({ chain: tiramisu, transport: http(undefined, { retryCount: 0 }) })
const A = "0xc360B9FBB59edDB38042745d315661409Ad16cf9"
const tries: [string, () => Expression][] = [
  ["$creator = addr", () => eq("$creator", addr(A))],
  ["$owner = addr", () => eq("$owner", addr(A))],
  ["$createdAt > u64", () => gt("$createdAt", u64(1n))],
  ["$expiresAt > u64", () => gt("$expiresAt", u64(1n))],
  ["$creator OR $creator", () => or(eq("$creator", addr(A)), eq("$creator", addr("0x0000000000000000000000000000000000000001")))],
]
for (const [name, mk] of tries) {
  try {
    const expr = mk()
    const r = await client.select({ key: true }).where(and(eq("app", "officially.v1"), expr)).limit(1).fetch()
    console.log(`OK   ${name} -> ${render(expr)} (entities: ${r.entities.length}, block ${r.blockNumber})`)
  } catch (e) {
    console.log(`FAIL ${name} -> ${(e as Error).name}: ${(e as Error).message.split("\n")[0]}`)
  }
}
