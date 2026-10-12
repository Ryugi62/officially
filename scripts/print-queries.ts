// Prints the exact Arkiv query strings the app runs (pasted into /arkiv/schema.md; checked by a test).
import { render } from "@arkiv-network/sdk/query"
import { QUERIES } from "../src/adapters/arkiv/reader"

const H = "0x" + "ab".repeat(32)
const A = "0x1111111111111111111111111111111111111111"
for (const [name, q] of Object.entries({
  projectRecords: QUERIES.projectRecords(A as `0x${string}`),
  attestations: QUERIES.attestations([H as `0x${string}`], [A as `0x${string}`]),
  claimants: QUERIES.claimants([H as `0x${string}`]),
  claimsBy: QUERIES.claimsBy(A as `0x${string}`),
  projects: QUERIES.projects(),
})) {
  console.log(`${name}: ${render(q.where)}${"createdBy" in q && q.createdBy ? `  + createdBy(${q.createdBy})` : ""}`)
}
