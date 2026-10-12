import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { http } from "viem"
import { checkTarget } from "../application/check-target"
import { checkTransaction, type TransactionVerdict } from "../application/check-transaction"
import type { AttestationReader } from "../application/ports"
import { ArkivIncidentFeed, createFeedClient } from "../adapters/arkiv/feed"
import { ArkivReader, ReadTimeoutError } from "../adapters/arkiv/reader"
import { readerFromSnapshot } from "../adapters/memory/memory-reader"
import { CachingReader } from "../adapters/memory/caching-reader"
import { approveCalldata } from "../adapters/web/calldata"
import { esc, renderVerdict, statusCopy, type RenderCtx } from "../adapters/web/view"
import type { Verdict } from "../domain/types"
import { DEMO } from "./demo"

const EXPLORER = "https://tiramisu.explorer.arkiv.network"
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const publicClient = createPublicClient({ chain: tiramisu, transport: http(undefined, { retryCount: 0 }) })
const live = new CachingReader(new ArkivReader(publicClient))
let reader: AttestationReader = live
let usingSnapshot = false
const pin = { rootKey: DEMO.rootKey, slug: DEMO.slug }

async function withFallback<T>(run: (r: AttestationReader) => Promise<T>): Promise<T> {
  try {
    return await run(reader)
  } catch (e) {
    if (usingSnapshot || !(e instanceof ReadTimeoutError || /429|rate|fetch/i.test(String(e)))) throw e
    const snap = await fetch(new URL("./snapshot.json", document.baseURI)).then((r) => (r.ok ? r.json() : null))
    if (!snap) throw e
    reader = readerFromSnapshot(snap)
    usingSnapshot = true
    $("live").textContent = `The public RPC is rate-limiting this network — showing the published snapshot at block ${snap.block}. Run the same query yourself from the README.`
    return run(reader)
  }
}

async function ctx(): Promise<RenderCtx> {
  return { projectName: DEMO.name.replace(/ \(synthetic\)$/, ""), explorer: EXPLORER, now: { block: await reader.currentBlock(), ms: Date.now() } }
}

function renderPin() {
  $("pin").innerHTML = `<div><div class="sub">Checking against</div><div class="who">${esc(DEMO.name)}</div>
  <div class="sub">root key <a href="${EXPLORER}/address/${esc(DEMO.rootKey)}" target="_blank" rel="noopener"><code>${esc(DEMO.rootKey)}</code></a></div></div>`
}

function renderTx(tv: TransactionVerdict, c: RenderCtx): string {
  const ok = tv.parts.filter((p) => p.verdict.status === "OFFICIAL").length
  const head = statusCopy(tv.verdict.status, c.projectName)
  const summary = tv.verdict.status === "OFFICIAL" ? "Safe to sign — every address checks out" : head.headline
  return `<div class="summary tone-${head.tone}"><div class="big">${ok} of ${tv.parts.length} published</div><div>${esc(summary)}</div></div>` +
    tv.parts.map((p) => renderVerdict(p.verdict, c, p.role)).join("")
}

const skeleton = '<div class="skeleton"></div><div class="skeleton"></div>'

async function runGuard() {
  const hijacked = $<HTMLInputElement>("hijack").checked
  const spender = hijacked ? DEMO.drainer : DEMO.router
  $("dapp-spender").textContent = spender
  const out = $("guard")
  out.innerHTML = skeleton
  try {
    const tv = await withFallback((r) =>
      checkTransaction(r, { request: { to: DEMO.token, data: approveCalldata(spender), chainId: DEMO.chainId }, origin: DEMO.origin, pin }),
    )
    out.innerHTML = renderTx(tv, await ctx())
  } catch (e) {
    out.innerHTML = `<p class="error">${esc(String((e as Error).message ?? e))}</p>`
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
  } catch (e) {
    out.innerHTML = `<p class="error">${esc(String((e as Error).message ?? e))}</p>`
  }
}

function startFeed() {
  const feed = new ArkivIncidentFeed(
    createFeedClient(),
    async (key) => {
      const e = await publicClient.getEntity(key)
      const type = (e.attributes as Record<string, { value?: unknown }> | undefined)?.type?.value
      return e.creator ? { type: String(type), creator: e.creator } : undefined
    },
    (err) => {
      $("live").textContent = `Live feed interrupted (${err.message.slice(0, 80)}) — checks still work.`
    },
  )
  feed.subscribe([DEMO.rootKey, DEMO.publisher], (key) => {
    live.invalidateAttestations()
    $("incidents").insertAdjacentHTML("afterbegin", `<div class="banner">New incident from ${esc(DEMO.name)} — entity <a href="${EXPLORER}/entity/${esc(key)}" target="_blank" rel="noopener">${esc(key.slice(0, 10))}…</a>. Re-checking…</div>`)
    void runGuard()
    if ($<HTMLInputElement>("q").value.trim()) void runCheck()
  })
  $("live").textContent = "Listening over a WebSocket for incidents signed by this project's keys. A new one re-runs your checks — no reload."
}

$("dapp-origin").textContent = DEMO.origin.replace(/^https:\/\//, "")
$("q").setAttribute("placeholder", DEMO.origin)
renderPin()
$("hijack").addEventListener("change", () => void runGuard())
$("approve").addEventListener("click", () => void runGuard())
$("check-form").addEventListener("submit", (e) => void runCheck(e))
void runGuard()
startFeed()
