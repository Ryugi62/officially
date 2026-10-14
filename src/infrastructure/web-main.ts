import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { http } from "viem"
import { checkTarget } from "../application/check-target"
import { checkTransaction, type TransactionVerdict } from "../application/check-transaction"
import type { AttestationReader } from "../application/ports"
import { ArkivIncidentFeed, createFeedClient } from "../adapters/arkiv/feed"
import { ArkivReader, ReadTimeoutError } from "../adapters/arkiv/reader"
import { CachingReader } from "../adapters/memory/caching-reader"
import { isRateLimit } from "../adapters/web/rate-limit"
import { readerFromSnapshot, type MemoryReader } from "../adapters/memory/memory-reader"
import { approveCalldata } from "../adapters/web/calldata"
import { blocksToText, esc, plainText, renderVerdict, snapshotHeadline, txHeadline, type RenderCtx } from "../adapters/web/view"
import { guardProvider, OfficiallyBlockedError } from "../adapters/wallet/guard"
import type { Address, Incident, ProjectRecord, Verdict } from "../domain/types"
import { DEMO } from "./demo"

const EXPLORER = "https://tiramisu.explorer.arkiv.network"
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const ADDR = /^0x[0-9a-fA-F]{40}$/

const params = new URLSearchParams(location.search)
const RPC = params.get("rpc") ?? undefined // any Arkiv node or watcher you trust more than the public one
const publicClient = createPublicClient({ chain: tiramisu, transport: http(RPC, { retryCount: 0 }) })
const arkiv = new ArkivReader(publicClient)
const live = new CachingReader(arkiv)
let reader: AttestationReader = live
let snapshot: { reader: MemoryReader; block: bigint } | undefined
let pin = { rootKey: savedPin() }
const linkRoot = params.get("root")
/** Anchors offered by the link are never used: they are learned only from the root-signed record. Shown so the user knows. */
const pageAnchors = params.getAll("anchor")
let pendingPin: Address | undefined = linkRoot && ADDR.test(linkRoot) && linkRoot.toLowerCase() !== pin.rootKey.toLowerCase() ? (linkRoot as Address) : undefined
let records: ProjectRecord[] = []
let unwatch: (() => void) | undefined

/** The pin is only ever changed by the user: a `?root=` link is offered, never applied silently (a phishing link could carry an attacker's root). */
function savedPin(): Address {
  let saved: string | null = null
  try { saved = localStorage.getItem("officially.root") } catch { /* private mode */ }
  return (saved && ADDR.test(saved) ? saved : DEMO.rootKey) as Address
}
function setPin(v: Address) {
  pin = { rootKey: v }
  try { localStorage.setItem("officially.root", v) } catch { /* private mode */ }
}

async function withFallback<T>(run: (r: AttestationReader) => Promise<T>): Promise<T> {
  try {
    return await run(reader)
  } catch (e) {
    if (snapshot || !isRateLimit(e)) throw e
    const snap = await fetch(new URL("./snapshot.json", document.baseURI)).then((r) => (r.ok ? r.json() : null))
    if (!snap) throw e
    snapshot = { reader: readerFromSnapshot(snap, Date.now()), block: BigInt(snap.block) }
    reader = snapshot.reader
    $("live").textContent = `The RPC is rate-limiting this network, so the page shows the snapshot published at block ${snap.block} (${snap.takenAt}). Leases are aged by the clock, but incidents raised after it are missing, so nothing from it counts as a clean pass. Add ?rpc=<your Arkiv node> to the URL, or run the README query yourself.`
    return run(reader)
  }
}

const projectName = () => records[0]?.name.replace(/ \(synthetic\)$/, "") || (pin.rootKey.toLowerCase() === DEMO.rootKey.toLowerCase() ? "Demo Swap" : "this project")
async function ctx(): Promise<RenderCtx> {
  return { projectName: projectName(), explorer: EXPLORER, now: { block: await reader.currentBlock(), ms: Date.now() }, ...(snapshot && { snapshotBlock: snapshot.block }) }
}

function trustedKeys(): Address[] {
  return [...new Set([pin.rootKey, ...records.flatMap((r) => [r.publisher, ...(r.revokes ? [r.revokes] : []), ...(r.previousPublishers ?? []).map((p) => p.address)])].map((a) => a.toLowerCase()))] as Address[]
}

const fingerprint = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

async function loadProject() {
  let limited = false
  records = await withFallback((r) => r.findProjectRecords(pin.rootKey)).catch((e) => { limited = isRateLimit(e); return [] })
  const r = records[0]
  const anchors = r?.anchors.map((a) => `<li>${esc(a.kind)}: <code>${esc(a.ref)}</code></li>`).join("") ?? ""
  const offer = pendingPin
    ? `<div class="offer"><p><strong>This link asks you to check against a different root key: <code>${esc(pendingPin)}</code>.</strong> Only accept it if you got the link from the project before any incident — a phishing link can carry an attacker's key.</p><button class="btn small" id="accept-pin" type="button">Use ${esc(fingerprint(pendingPin))}</button> <button class="btn small ghost" id="keep-pin" type="button">Keep ${esc(fingerprint(pin.rootKey))}</button></div>`
    : ""
  const dropped = pageAnchors.length ? `<div class="offer"><p><strong>This link offered ${pageAnchors.length} anchor(s) — ignored.</strong> Anchors are read only from the record signed by the root key, never from a link or page.</p></div>` : ""
  $("pin").innerHTML = `<div class="pin-main">${offer}${dropped}<div class="sub">Checking against root key</div>
    <div class="who"><code>${esc(fingerprint(pin.rootKey))}</code> <span class="sub">${r ? `self-declared name: ${esc(r.name)}` : (snapshot || limited ? "RPC limit — snapshot shown, signing verdict on hold" : "no project record for this key")}</span></div>
    <form id="pin-form" class="pin-form"><label class="label" for="root">Project root key (the identity — names are self-declared)</label><input id="root" value="${esc(pin.rootKey)}" spellcheck="false" autocomplete="off"><button class="btn small" type="submit">Pin</button></form>
    ${r ? `<details><summary>Where the project states this key</summary><ul>${anchors || "<li>No anchors in the record.</li>"}</ul><p class="sub">Pin a root key from a source you trusted before any incident (its GitHub, its ENS name). A hijacked site cannot change these records: only this key can.</p></details>` : ""}</div>`
  $("pin-form").addEventListener("submit", (e) => {
    e.preventDefault()
    const v = $<HTMLInputElement>("root").value.trim()
    if (!ADDR.test(v)) return
    setPin(v as Address)
    pendingPin = undefined
    void boot()
  })
  document.getElementById("accept-pin")?.addEventListener("click", () => { setPin(pendingPin!); pendingPin = undefined; void boot() })
  document.getElementById("keep-pin")?.addEventListener("click", () => { pendingPin = undefined; void loadProject() })
}

function renderTx(tv: TransactionVerdict, c: RenderCtx, gate?: string): string {
  const published = tv.parts.filter((p) => p.verdict.status === "OFFICIAL" || p.verdict.status === "PROBATION").length
  const onHold = tv.parts.filter((p) => p.verdict.status === "PROBATION").length
  const head = c.snapshotBlock !== undefined && tv.verdict.status === "OFFICIAL" ? snapshotHeadline() : txHeadline(tv, c.projectName)
  const tone = head.tone
  return `<div class="summary tone-${tone}"><div class="big">${esc(head.text)}</div><div>${published} of ${tv.parts.length} addresses published by ${esc(c.projectName)}'s keys${onHold ? ` · ${onHold} on hold` : ""}${gate ? ` · ${esc(gate)}` : ""}</div></div>` +
    tv.parts.map((p) => renderVerdict(p.verdict, c, p.role)).join("")
}

const skeleton = '<div class="skeleton"></div><div class="skeleton"></div>'
const showError = (out: HTMLElement, e: unknown) => { out.innerHTML = `<p class="error">${esc(isRateLimit(e) ? "RPC limit — nothing could be read and no snapshot is available; signing verdict on hold. Add ?rpc=<your Arkiv node>." : String((e as Error)?.message ?? e))}</p>` }

/** The demo wallet: stands in for MetaMask. The dApp talks to it only through guardProvider, like a real integration. */
const demoWallet = {
  async request({ method }: { method: string }) {
    if (method === "eth_chainId") return "0x" + DEMO.chainId.toString(16)
    if (method === "eth_sendTransaction") return "wallet-prompt"
    throw Object.assign(new Error("unsupported in the demo wallet"), { code: 4200 })
  },
}

async function runGuard() {
  const hijacked = $<HTMLInputElement>("hijack").checked
  const spender = hijacked ? DEMO.drainer : DEMO.router
  $("dapp-spender").textContent = spender
  const out = $("guard")
  out.innerHTML = skeleton
  let tv: TransactionVerdict | undefined
  const wallet = guardProvider(demoWallet, {
    origin: DEMO.origin,
    check: (req, origin) => withFallback((r) => checkTransaction(r, { request: req, origin, pin })),
    onVerdict: (v) => { tv = v },
    isLive: () => !snapshot,
  })
  try {
    await wallet.request({ method: "eth_sendTransaction", params: [{ to: DEMO.token, data: approveCalldata(spender) }] })
    out.innerHTML = renderTx(tv!, await ctx(), "passed to your wallet to sign")
  } catch (e) {
    if (e instanceof OfficiallyBlockedError) out.innerHTML = renderTx(e.verdict, await ctx(), snapshot ? "held: only the snapshot is available, not passed to your wallet" : "blocked before your wallet saw it")
    else showError(out, e)
  }
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
    createFeedClient(RPC?.replace(/^http/, "ws")),
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
