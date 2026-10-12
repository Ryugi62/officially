import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { http } from "viem"
import { checkTarget } from "../application/check-target"
import { checkTransaction, type TransactionVerdict } from "../application/check-transaction"
import type { AttestationReader } from "../application/ports"
import { ArkivIncidentFeed, createFeedClient } from "../adapters/arkiv/feed"
import { ArkivReader, ReadTimeoutError } from "../adapters/arkiv/reader"
import { CachingReader } from "../adapters/memory/caching-reader"
import { readerFromSnapshot, type MemoryReader } from "../adapters/memory/memory-reader"
import { approveCalldata } from "../adapters/web/calldata"
import { blocksToText, esc, plainText, renderVerdict, statusCopy, type RenderCtx } from "../adapters/web/view"
import type { Address, Incident, ProjectRecord, Verdict } from "../domain/types"
import { DEMO } from "./demo"

const EXPLORER = "https://tiramisu.explorer.arkiv.network"
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const ADDR = /^0x[0-9a-fA-F]{40}$/

const publicClient = createPublicClient({ chain: tiramisu, transport: http(undefined, { retryCount: 0 }) })
const arkiv = new ArkivReader(publicClient)
const live = new CachingReader(arkiv)
let reader: AttestationReader = live
let snapshot: { reader: MemoryReader; block: bigint } | undefined
let pin = { rootKey: readPin() }
let records: ProjectRecord[] = []
let unwatch: (() => void) | undefined

function readPin(): Address {
  const q = new URLSearchParams(location.search).get("root")
  let saved: string | null = null
  try { saved = localStorage.getItem("officially.root") } catch { /* private mode */ }
  const v = q ?? saved ?? DEMO.rootKey
  return (ADDR.test(v) ? v : DEMO.rootKey) as Address
}

function isRateLimit(e: unknown) {
  return e instanceof ReadTimeoutError || /429|rate|fetch|Failed to fetch/i.test(String((e as Error)?.message ?? e))
}

async function withFallback<T>(run: (r: AttestationReader) => Promise<T>): Promise<T> {
  try {
    return await run(reader)
  } catch (e) {
    if (snapshot || !isRateLimit(e)) throw e
    const snap = await fetch(new URL("./snapshot.json", document.baseURI)).then((r) => (r.ok ? r.json() : null))
    if (!snap) throw e
    snapshot = { reader: readerFromSnapshot(snap), block: BigInt(snap.block) }
    reader = snapshot.reader
    $("live").textContent = `The public RPC is rate-limiting this network, so the page shows the snapshot published at block ${snap.block}. Nothing from it counts as a clean pass. Run the same query yourself (see the README).`
    return run(reader)
  }
}

const projectName = () => records[0]?.name.replace(/ \(synthetic\)$/, "") || (pin.rootKey.toLowerCase() === DEMO.rootKey.toLowerCase() ? "Demo Swap" : "this project")
async function ctx(): Promise<RenderCtx> {
  return { projectName: projectName(), explorer: EXPLORER, now: { block: await reader.currentBlock(), ms: Date.now() }, ...(snapshot && { snapshotBlock: snapshot.block }) }
}

function trustedKeys(): Address[] {
  return [...new Set([pin.rootKey, ...records.flatMap((r) => [r.publisher, ...(r.revokes ? [r.revokes] : []), ...(r.previousPublishers ?? [])])].map((a) => a.toLowerCase()))] as Address[]
}

async function loadProject() {
  records = await withFallback((r) => r.findProjectRecords(pin.rootKey)).catch(() => [])
  const r = records[0]
  const anchors = r?.anchors.map((a) => `<li>${esc(a.kind)}: <code>${esc(a.ref)}</code></li>`).join("") ?? ""
  $("pin").innerHTML = `<div class="pin-main"><div class="sub">Checking against the project whose root key is</div>
    <div class="who">${esc(r?.name ?? "No project record found for this key")}</div>
    <form id="pin-form" class="pin-form"><label class="label" for="root">Project root key</label><input id="root" value="${esc(pin.rootKey)}" spellcheck="false" autocomplete="off"><button class="btn small" type="submit">Pin</button></form>
    ${r ? `<details><summary>Where the project states this key</summary><ul>${anchors || "<li>No anchors in the record.</li>"}</ul><p class="sub">Pin a root key from a source you trusted before any incident (its GitHub, its ENS name). A hijacked site cannot change these records: only this key can.</p></details>` : ""}</div>`
  $("pin-form").addEventListener("submit", (e) => {
    e.preventDefault()
    const v = $<HTMLInputElement>("root").value.trim()
    if (!ADDR.test(v)) return
    pin = { rootKey: v as Address }
    try { localStorage.setItem("officially.root", v) } catch { /* private mode */ }
    void boot()
  })
}

function renderTx(tv: TransactionVerdict, c: RenderCtx): string {
  const published = tv.parts.filter((p) => p.verdict.status === "OFFICIAL" || p.verdict.status === "PROBATION").length
  const onHold = tv.parts.filter((p) => p.verdict.status === "PROBATION").length
  const head = statusCopy(tv.verdict.status, c.projectName)
  let tone = c.snapshotBlock !== undefined && head.tone === "ok" ? "warn" : head.tone
  let summary = tv.verdict.status === "OFFICIAL" ? "Safe to sign — every address checks out" : head.headline
  if (tv.undecoded) { tone = "warn"; summary = "The contract checks out, but this call's arguments were not decoded — only the contract was checked" }
  return `<div class="summary tone-${tone}"><div class="big">${published} of ${tv.parts.length} published${onHold ? ` · ${onHold} on hold` : ""}</div><div>${esc(summary)}</div></div>` +
    tv.parts.map((p) => renderVerdict(p.verdict, c, p.role)).join("")
}

const skeleton = '<div class="skeleton"></div><div class="skeleton"></div>'
const showError = (out: HTMLElement, e: unknown) => { out.innerHTML = `<p class="error">${esc(String((e as Error)?.message ?? e))}</p>` }

async function runGuard() {
  const hijacked = $<HTMLInputElement>("hijack").checked
  const spender = hijacked ? DEMO.drainer : DEMO.router
  $("dapp-spender").textContent = spender
  const out = $("guard")
  out.innerHTML = skeleton
  try {
    const tv = await withFallback((r) => checkTransaction(r, { request: { to: DEMO.token, data: approveCalldata(spender), chainId: DEMO.chainId }, origin: DEMO.origin, pin }))
    out.innerHTML = renderTx(tv, await ctx())
  } catch (e) { showError(out, e) }
}

async function runCheck(ev?: Event) {
  ev?.preventDefault()
  const q = $<HTMLInputElement>("q").value.trim()
  const chainId = Number($<HTMLInputElement>("chain").value) || undefined
  const out = $("result")
  if (!q) return
  out.innerHTML = skeleton
  try {
    if (q.startsWith("{")) {
      const req = JSON.parse(q)
      const request = "typedData" in req || "domain" in req ? { typedData: req.typedData ?? req } : { to: req.to, data: req.data, chainId: Number(req.chainId ?? chainId) }
      const tv = await withFallback((r) => checkTransaction(r, { request, ...(req.origin && { origin: req.origin }), pin }))
      out.innerHTML = renderTx(tv, await ctx())
    } else {
      const v: Verdict = await withFallback((r) => checkTarget(r, { raw: q, ...(chainId && { chainId }), pin }))
      out.innerHTML = renderVerdict(v, await ctx())
    }
  } catch (e) { showError(out, e) }
}

function renderIncident(i: Incident, block: bigint) {
  return `<div class="incident-row"><strong>${esc(plainText(i.title))}</strong> — ${esc(plainText(i.advice))}<div class="meta">On <code>${esc(i.target ?? "")}</code> · severity ${i.severity} · ${blocksToText(i.expiresAtBlock - block)} left unless someone keeps it alive · <a href="${EXPLORER}/entity/${esc(i.key)}" target="_blank" rel="noopener">entity</a></div></div>`
}

async function loadIncidents() {
  try {
    const list = snapshot ? await snapshot.reader.listIncidentsBy(trustedKeys()) : await arkiv.listIncidentsBy(trustedKeys())
    const block = await reader.currentBlock()
    $("incidents").innerHTML = list.length ? list.map((i) => renderIncident(i, block)).join("") : '<p class="sub">No live incidents from this project.</p>'
  } catch { /* the checks above still work */ }
}

function startFeed() {
  unwatch?.()
  const feed = new ArkivIncidentFeed(
    createFeedClient(),
    async (key) => {
      const e = await publicClient.getEntity(key)
      const type = (e.attributes as Record<string, { value?: unknown }> | undefined)?.type?.value
      return e.creator ? { type: String(type), creator: e.creator } : undefined
    },
    (err) => { $("live").textContent = `Live feed interrupted (${err.message.slice(0, 80)}) — checks still work.` },
  )
  unwatch = feed.subscribe(trustedKeys(), (key) => {
    live.invalidateAttestations()
    $("incidents").insertAdjacentHTML("afterbegin", `<div class="banner">New incident from ${esc(projectName())} — <a href="${EXPLORER}/entity/${esc(key)}" target="_blank" rel="noopener">${esc(key.slice(0, 10))}…</a>. Re-checking…</div>`)
    void runGuard()
    void loadIncidents()
    if ($<HTMLInputElement>("q").value.trim()) void runCheck()
  })
  if (!snapshot) $("live").textContent = "Listening over a WebSocket for incidents signed by this project's keys. A new one re-runs your checks — no reload."
}

async function boot() {
  await loadProject()
  await runGuard()
  await loadIncidents()
  startFeed()
}

$("dapp-origin").textContent = DEMO.origin.replace(/^https:\/\//, "")
$("q").setAttribute("placeholder", DEMO.origin)
$("hijack").addEventListener("change", () => void runGuard())
$("approve").addEventListener("click", () => void runGuard())
$("check-form").addEventListener("submit", (e) => void runCheck(e))
void boot()
