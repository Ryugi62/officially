// Claims Tiramisu test GLM from the Arkiv Hub faucet for one recipient.
// HUB_KEY (testnet key, env only) signs in with SIWE; the Cap.js proof-of-work is solved the same way the widget solves it.
import { createHash } from "node:crypto"
import { privateKeyToAccount } from "viem/accounts"
import { createSiweMessage } from "viem/siwe"

const HUB = "https://hub.arkiv.network"
const recipient = process.argv[2]
if (!recipient) throw new Error("usage: faucet-claim.ts <recipient>")
const account = privateKeyToAccount(process.env.HUB_KEY as `0x${string}`)
const chainId = 7738577
const jar: string[] = []
const keep = (r: Response) => { for (const c of r.headers.getSetCookie()) jar.push(c.split(";")[0]!) }
const H = () => ({ "content-type": "application/json", origin: HUB, cookie: jar.join("; ") })

const n = await fetch(`${HUB}/api/auth/siwe/nonce`, { method: "POST", headers: H(), body: JSON.stringify({ walletAddress: account.address, chainId }) })
keep(n)
const { nonce } = (await n.json()) as { nonce: string }
const message = createSiweMessage({ domain: "hub.arkiv.network", address: account.address, statement: "Sign in to Arkiv Hub.", uri: HUB, version: "1", chainId, nonce })
const v = await fetch(`${HUB}/api/auth/siwe/verify`, { method: "POST", headers: H(), body: JSON.stringify({ message, signature: await account.signMessage({ message }), walletAddress: account.address, chainId }) })
keep(v)
if (!v.ok) throw new Error(`sign-in failed ${v.status}`)

const state = (await (await fetch(`${HUB}/api/faucet?recipient=${encodeURIComponent(recipient)}`, { headers: H() })).json()) as { captchaEndpoint: string; cooldownUntil: string | null; amountGlm: string }
console.log("faucet state", JSON.stringify({ amountGlm: state.amountGlm, cooldownUntil: state.cooldownUntil }))

// Cap.js: prng(seed,len) = xorshift32 seeded by FNV-1a, hex; challenge i = [prng(token+i, s), prng(token+i+"d", d)]
function prng(seed: string, len: number) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24) }
  let st = h >>> 0, out = ""
  const next = () => { st ^= st << 13; st ^= st >>> 17; st ^= st << 5; return st >>> 0 }
  while (out.length < len) out += next().toString(16).padStart(8, "0")
  return out.substring(0, len)
}
const ch = (await (await fetch(`${state.captchaEndpoint}challenge`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).json()) as { challenge: { c: number; s: number; d: number }; token: string; instrumentation?: string }
if (ch.instrumentation) console.log("note: server sent an instrumentation blob (not executed)")
const t0 = Date.now()
const solutions: number[] = []
for (let i = 1; i <= ch.challenge.c; i++) {
  const salt = prng(`${ch.token}${i}`, ch.challenge.s), target = prng(`${ch.token}${i}d`, ch.challenge.d)
  let k = 0
  while (!createHash("sha256").update(salt + k).digest("hex").startsWith(target)) k++
  solutions.push(k)
}
const red = (await (await fetch(`${state.captchaEndpoint}redeem`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: ch.token, solutions }) })).json()) as { success: boolean; token?: string; error?: string }
console.log("captcha", red.success ? "solved" : `failed ${red.error}`, `${Date.now() - t0} ms`)
if (!red.success || !red.token) process.exit(1)
const claim = await fetch(`${HUB}/api/faucet`, { method: "POST", headers: H(), body: JSON.stringify({ recipient, captchaToken: red.token }) })
console.log("claim", claim.status, (await claim.text()).slice(0, 400))
