// Physical test of cursor pagination: walk the publisher's claims 2 per page and compare with a single 200-page read.
import { createPublicClient } from "@arkiv-network/sdk"
import { str } from "@arkiv-network/sdk/attr"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { and, eq } from "@arkiv-network/sdk/query"
import { http } from "viem"
const c = createPublicClient({ chain: tiramisu, transport: http(undefined, { retryCount: 0 }) })
const publisher = "0x04a16DA7180594eF2dFFcF70431e809432CE438F"
const q = () => c.select({ key: true }).where(and(eq("app", str("officially.v1")), eq("type", str("endpoint")))).createdBy(publisher)
const all = (await q().limit(200).fetch()).entities.map((e) => e.key)
const walked: string[] = []
let page = await q().limit(2).fetch(), pages = 1
walked.push(...page.entities.map((e) => e.key))
while (page.cursor) { page = await q().limit(2).cursor(page.cursor).fetch(); pages++; walked.push(...page.entities.map((e) => e.key)) }
console.log(`one read: ${all.length} claims · cursor walk: ${walked.length} claims in ${pages} pages of 2 · same set: ${all.length === walked.length && all.every((k) => walked.includes(k))} · duplicates: ${walked.length - new Set(walked).size}`)
