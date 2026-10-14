// Prints the live project record(s) of a root key: publisher, anchors, block. Read-only.
import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { http } from "viem"
import { ArkivReader } from "../../src/adapters/arkiv/reader"

const root = process.argv[2] as `0x${string}`
const r = new ArkivReader(createPublicClient({ chain: tiramisu, transport: http(process.env.OFFICIALLY_RPC, { retryCount: 0 }) }))
for (const x of await r.findProjectRecords(root)) console.log(JSON.stringify({ key: x.key, slug: x.slug, publisher: x.publisher, revokes: x.revokes, anchors: x.anchors, createdAtBlock: String(x.createdAtBlock) }))
