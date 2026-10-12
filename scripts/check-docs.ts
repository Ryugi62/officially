// Fails if a number quoted in the submission docs differs from the log it came from, or if the docs contain
// forbidden vocabulary ("TTL" — Arkiv says Entity Expiration) or internal traces.
import { readFileSync } from "node:fs"
const docs = ["README.md", "arkiv/schema.md", "arkiv/friction.md", "index.html"].map((f) => [f, readFileSync(f, "utf8")] as const)
const readme = readFileSync("README.md", "utf8"), friction = readFileSync("arkiv/friction.md", "utf8")
const lat = JSON.parse(readFileSync("arkiv/repro-logs/measure-latency.log", "utf8").trim().split("\n").pop()!)
const ws = readFileSync("arkiv/repro-logs/ws-incident-latency.log", "utf8").match(/(\d+) ms after the write resolved/)![1]!
const fmt = (n: number) => n.toLocaleString("en-US")
const expectations: [string, string, string][] = [
  ["README p50", readme, `p50 ${fmt(lat.p50_ms)} ms`],
  ["README p90", readme, `p90 ${fmt(lat.p90_ms)} ms`],
  ["README requests/check", readme, `≤ ${lat.rpc_requests_per_check_max} RPC requests`],
  ["README WebSocket push", readme, `${ws} ms after the write`],
  ["friction p50", friction, `p50 ${fmt(lat.p50_ms)} ms`],
  ["friction WebSocket", friction, `${ws} ms after the write resolved`],
]
let bad = 0
for (const [name, text, needle] of expectations) if (!text.includes(needle)) { bad++; console.log(`MISMATCH ${name}: expected "${needle}"`) }
for (const [f, t] of docs) {
  for (const [re, why] of [[/\bTTL\b/, "say Entity Expiration, not TTL"], [/\[\[|projects\/|메인|확인 필요|TODO|TBD/, "internal trace"]] as const) {
    const m = t.match(re)
    if (m) { bad++; console.log(`FORBIDDEN in ${f}: "${m[0]}" (${why})`) }
  }
}
console.log(bad ? `${bad} problem(s)` : "docs match the logs; no forbidden words")
process.exit(bad ? 1 : 0)
