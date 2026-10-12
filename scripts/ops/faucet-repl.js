// Runs inside `aside repl` (Aside Browser automation context). Claims testnet GLM from the Arkiv Hub faucet.
// The page only gets an address-reporting provider; SIWE signatures come from scripts/ops/local-signer.ts on 127.0.0.1,
// which holds the TESTNET key and signs nothing but the Hub sign-in message. The captcha is solved by the real browser.
const S = "http://127.0.0.1:47811"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const hexToText = (h) => decodeURIComponent(h.slice(2).replace(/../g, "%$&"))
const addr = (await (await fetch(S + "/address")).json()).address
const p = await openTab("https://hub.arkiv.network/faucet")
await sleep(3000)
const signOut = () => p.evaluate(() => fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then((r) => r.status))
log("sign-out (start)", await signOut())
await p.reload()
await sleep(4000)
const inject = async () =>
  p.evaluate((ADDR) => {
    if (window.__officiallyInjected) return "already"
    window.__officiallyInjected = true
    const provider = {
      async request({ method, params }) {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [ADDR]
        if (method === "eth_chainId") return "0x7614d1"
        if (method === "net_version") return "7738577"
        if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null
        if (method === "wallet_requestPermissions" || method === "wallet_getPermissions") return [{ parentCapability: "eth_accounts" }]
        if (method === "personal_sign") {
          window.__pending = params[0]
          window.__sig = null
          for (let i = 0; i < 600; i++) {
            if (window.__sig) { const s = window.__sig; window.__pending = null; return s }
            await new Promise((r) => setTimeout(r, 200))
          }
          throw Object.assign(new Error("User rejected the request."), { code: 4001 })
        }
        throw Object.assign(new Error("Unsupported method " + method), { code: 4200 })
      },
      on() {},
      removeListener() {},
    }
    const info = { uuid: crypto.randomUUID(), name: "Officially Test Signer", icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect width='1' height='1' fill='%233182f6'/%3E%3C/svg%3E", rdns: "dev.officially.signer" }
    const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }))
    window.addEventListener("eip6963:requestProvider", announce)
    announce()
    return "injected"
  }, addr)
log("inject", await inject())
const text = async () => { const t = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, " "); const i = t.indexOf("GET TESTNET"); return t.slice(i < 0 ? 0 : i, (i < 0 ? 0 : i) + 700) }
const clickText = async (re) => {
  const ok = await p.evaluate((src) => {
    const re = new RegExp(src, "i")
    const els = [...document.querySelectorAll("button, [role=button], a")].filter((e) => re.test(e.innerText || e.getAttribute("aria-label") || "") && e.offsetParent !== null && !e.disabled)
    if (!els.length) return false
    els[0].scrollIntoView({ block: "center" })
    const r = els[0].getBoundingClientRect()
    window.__clickAt = [r.x + r.width / 2, r.y + r.height / 2]
    return true
  }, re.source)
  if (!ok) return false
  const [x, y] = await p.evaluate(() => window.__clickAt)
  await p.mouse.click(x, y)
  return true
}
log("connect", await clickText(/^\s*connect wallet\s*$/))
await sleep(1500)
log("pick", await clickText(/Officially Test Signer/))
await sleep(2500)
log("page", await text())
// sign-in: answer at most 2 SIWE requests through the local signer
for (let round = 0; round < 2; round++) {
  await clickText(/sign in with ethereum|^\s*sign in\s*$/)
  let pending = null
  for (let i = 0; i < 50 && !pending; i++) { await sleep(300); pending = await p.evaluate(() => window.__pending) }
  if (!pending) break
  const message = pending.startsWith("0x") ? hexToText(pending) : pending
  const r = await fetch(S + "/sign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }) })
  log("signer", r.status)
  if (!r.ok) break
  const { signature } = await r.json()
  await p.evaluate((s) => { window.__sig = s }, signature)
  await sleep(4000)
  if (!/sign in with/i.test(await text())) break
}
await sleep(2000)
log("after sign-in", await text())
// captcha: click the cap widget like a person would
const box = await p.evaluate(() => {
  const w = document.querySelector("cap-widget")
  if (!w) return null
  w.scrollIntoView({ block: "center" })
  const r = w.getBoundingClientRect()
  return [r.x + 30, r.y + r.height / 2]
})
log("captcha widget", JSON.stringify(box))
if (box) {
  await p.mouse.click(box[0], box[1])
  let ready = false
  for (let i = 0; i < 60 && !ready; i++) {
    await sleep(1000)
    ready = await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find((e) => /send testnet/i.test(e.innerText)); return !!b && !b.disabled })
  }
  const capState = await p.evaluate(() => { const w = document.querySelector("cap-widget"); return w ? (w.shadowRoot ? w.shadowRoot.textContent : w.textContent).replace(/\s+/g, " ").slice(0, 120) : "none" })
  log("captcha", ready ? "send enabled" : "send still disabled", "| widget:", capState)
  if (ready) {
    log("claim", await clickText(/send testnet/))
    for (let i = 0; i < 12; i++) { await sleep(2500); const t = await text(); if (/0x[0-9a-f]{64}|confirmed|next claim|sent|success/i.test(t)) break }
  }
  log("result", await text())
}
log("sign-out (end)", await signOut())
await closeTab(p)
