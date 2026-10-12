#!/usr/bin/env node
// An independent client for the officially.v1 data contract, written from /arkiv/schema.md only.
// It imports nothing from this repo's src/: raw JSON-RPC (fetch) + keccak256 from @noble/hashes.
// Usage: node examples/independent-check.mjs <https://origin | eip155:<chain>:<0xaddress>> <projectRootKey>
import { keccak_256 } from "@noble/hashes/sha3"
import { bytesToHex } from "@noble/hashes/utils"

const RPC = process.env.ARKIV_RPC ?? "https://rpc.tiramisu.db-chain.testnet.arkiv.network"
const PROBATION_BLOCKS = 86_400n

/** schema.md "Target normalization": web → origin; contract → CAIP-10 lowercase. */
export function normalize(raw) {
  if (/^eip155:\d+:0x[0-9a-fA-F]{40}$/.test(raw)) return raw.toLowerCase()
  return new URL(raw.includes("://") ? raw : `https://${raw}`).origin
}
export const targetHash = (t) => "0x" + bytesToHex(keccak_256(new TextEncoder().encode(t)))

const attr = (e, name) => e.attributes?.find((a) => a.name === name)?.value
const hex = (x) => BigInt(x)

const payloadJson = (e) => { try { return JSON.parse(new TextDecoder().decode(Uint8Array.from((e.payload ?? "0x").slice(2).match(/../g) ?? [], (h) => parseInt(h, 16)))) } catch { return {} } }

/** schema.md "Verdicts", rules 1–6, over raw arkiv_query rows (payload hex-encoded, as the node returns it). */
export function verdictFromRaw({ rows, root, hash, block }) {
  const live = rows.filter((e) => hex(e.expiresAt) > block)
  const records = live.filter((e) => attr(e, "type") === "project" && e.creator.toLowerCase() === root.toLowerCase())
  const trusted = new Set([root.toLowerCase(), ...records.map((r) => String(attr(r, "publisher")).toLowerCase())])
  // retired key → block its warning power ended: `revokes` ends at the record's creation (or its compromisedSinceBlock), history entries carry theirs
  const revoked = new Map()
  const add = (a, until) => { const k = String(a).toLowerCase(); if (!trusted.has(k) && (!revoked.has(k) || until < revoked.get(k))) revoked.set(k, until) }
  for (const r of records) {
    const p = payloadJson(r)
    const created = hex(r.createdAt), since = /^\d+$/.test(String(p.compromisedSinceBlock ?? "")) ? BigInt(p.compromisedSinceBlock) : undefined
    if (attr(r, "revokes")) add(attr(r, "revokes"), since !== undefined && since < created ? since : created)
    for (const h of p.previousPublishers ?? []) if (h?.address && /^\d+$/.test(String(h.retiredAtBlock))) add(h.address, BigInt(h.retiredAtBlock))
  }
  const isTrusted = (e) => trusted.has(e.creator.toLowerCase())
  const canWarn = (e) => isTrusted(e) || (revoked.has(e.creator.toLowerCase()) && hex(e.createdAt) < revoked.get(e.creator.toLowerCase()))
  const zero = "0x" + "0".repeat(64)
  const incidents = live.filter((e) => attr(e, "type") === "incident" && [hash, zero].includes(String(attr(e, "target_hash")).toLowerCase()) && canWarn(e))
  if (incidents.length) return "INCIDENT"
  const claims = live.filter((e) => attr(e, "type") === "endpoint" && String(attr(e, "target_hash")).toLowerCase() === hash)
  const mine = claims.filter(isTrusted)
  if (mine.length) return mine.some((c) => block - hex(c.createdAt) >= PROBATION_BLOCKS) ? "OFFICIAL" : "PROBATION"
  if (claims.some((c) => revoked.has(c.creator.toLowerCase()))) return "REVOKED"
  return claims.length ? "FORGED" : "UNLISTED"
}

async function query(q) {
  const body = { jsonrpc: "2.0", id: 1, method: "arkiv_query", params: [q, { limit: "0xc8", select: { key: true, creator: true, createdAt: true, expiresAt: true, attributes: true, payload: true } }] }
  const r = await (await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json()
  if (r.error) throw new Error(r.error.message)
  return r.result
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [raw, root] = process.argv.slice(2)
  if (!raw || !root) { console.error("usage: node examples/independent-check.mjs <target> <rootKey>"); process.exit(2) }
  const t = normalize(raw), h = targetHash(t)
  const recs = await query(`app = str('officially.v1') AND type = str('project') AND $creator = addr(${root})`)
  const keys = [root, ...recs.data.flatMap((e) => [attr(e, "publisher"), attr(e, "revokes"), ...(payloadJson(e).previousPublishers ?? []).map((h) => h.address)]).filter(Boolean)]
  const att = await query(`app = str('officially.v1') AND (target_hash = bytes32(${h}) OR type = str('incident') AND target_hash = bytes32(0x${"0".repeat(64)})) AND (${keys.map((k) => `$creator = addr(${k})`).join(" OR ")})`)
  const all = await query(`app = str('officially.v1') AND type = str('endpoint') AND target_hash = bytes32(${h})`)
  const rows = [...recs.data, ...att.data, ...all.data.filter((e) => !att.data.some((x) => x.key === e.key))]
  console.log(verdictFromRaw({ rows, root, hash: h, block: hex(att.blockNumber) }), t)
}
