import { createPublicClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { http } from "viem"
import { checkPasted } from "../application/check-pasted"
import type { AttestationReader } from "../application/ports"
import { ArkivReader } from "../adapters/arkiv/reader"
import { CachingReader } from "../adapters/memory/caching-reader"
import { readerFromSnapshot } from "../adapters/memory/memory-reader"
import { isRateLimit } from "../adapters/web/rate-limit"
import { esc, renderTransaction, snapshotHeadline } from "../adapters/web/view"
import type { Address } from "../domain/types"
import { DEMO } from "./demo"

const EXPLORER = "https://tiramisu.explorer.arkiv.network"
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const ADDR = /^0x[0-9a-fA-F]{40}$/
const RPC = new URLSearchParams(location.search).get("rpc") ?? undefined
let reader: AttestationReader = new CachingReader(new ArkivReader(createPublicClient({ chain: tiramisu, transport: http(RPC, { retryCount: 0 }) })))
let snapshotBlock: bigint | undefined

$<HTMLInputElement>("root").value = DEMO.rootKey

async function withFallback<T>(run: (r: AttestationReader) => Promise<T>): Promise<T> {
  try {
    return await run(reader)
  } catch (e) {
    if (snapshotBlock !== undefined || !isRateLimit(e)) throw e
    const snap = await fetch(new URL("./snapshot.json", document.baseURI)).then((r) => (r.ok ? r.json() : null))
    if (!snap) throw e
    snapshotBlock = BigInt(snap.block)
    reader = readerFromSnapshot(snap, Date.now())
    return run(reader)
  }
}

async function run(ev: Event) {
  ev.preventDefault()
  const out = $("result")
  const root = $<HTMLInputElement>("root").value.trim()
  const text = $<HTMLTextAreaElement>("text").value
  if (!text.trim()) return
  if (!ADDR.test(root)) { out.innerHTML = '<p class="error">The project root key must be a 0x address (42 characters).</p>'; return }
  out.innerHTML = '<div class="skeleton"></div>'
  try {
    const res = await withFallback((r) => checkPasted(r, { text, pin: { rootKey: root as Address } }))
    $("read").hidden = false
    $("read-out").textContent = JSON.stringify(res.pasted, null, 2)
    if (res.kind === "incomplete") {
      out.innerHTML = `<p class="error">Could not find ${esc(res.lack.join(", "))} in the pasted text, so nothing was checked. Copy the whole confirmation window, including the hex data and the network.</p>`
      return
    }
    const name = root.toLowerCase() === DEMO.rootKey.toLowerCase() ? "Demo Swap" : "this project"
    const block = await withFallback((r) => r.currentBlock())
    out.innerHTML = renderTransaction(res.tv, { projectName: name, explorer: EXPLORER, now: { block, ms: Date.now() }, ...(snapshotBlock !== undefined && { snapshotBlock }) })
    if (snapshotBlock !== undefined) out.insertAdjacentHTML("afterbegin", `<p class="sub">${esc(snapshotHeadline().text)} (snapshot at block ${snapshotBlock}).</p>`)
  } catch (e) {
    out.innerHTML = `<p class="error">${esc(isRateLimit(e) ? "RPC limit: nothing could be read, so there is no verdict. Add ?rpc=<your Arkiv node> to the URL." : String((e as Error)?.message ?? e))}</p>`
  }
}
$("paste-form").addEventListener("submit", (e) => void run(e))
