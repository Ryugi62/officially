// Signs in to Arkiv Hub (SIWE) with a TESTNET key from the environment and prints only status + the faucet state.
// The key never leaves this process; the session cookie is written to a scratch file passed as argv[2].
import { writeFileSync } from "node:fs"
import { privateKeyToAccount } from "viem/accounts"
import { createSiweMessage } from "viem/siwe"

const HUB = "https://hub.arkiv.network"
const account = privateKeyToAccount(process.env.HUB_KEY as `0x${string}`)
const chainId = Number(process.env.HUB_CHAIN ?? 7738577)
const jar: string[] = []
const keep = (r: Response) => { for (const c of r.headers.getSetCookie()) jar.push(c.split(";")[0]!) }
const cookie = () => jar.join("; ")

const n = await fetch(`${HUB}/api/auth/siwe/nonce`, { method: "POST", headers: { "content-type": "application/json", origin: HUB }, body: JSON.stringify({ walletAddress: account.address, chainId }) })
keep(n)
const { nonce } = (await n.json()) as { nonce: string }
const message = createSiweMessage({ domain: "hub.arkiv.network", address: account.address, statement: "Sign in to Arkiv Hub.", uri: HUB, version: "1", chainId, nonce })
const signature = await account.signMessage({ message })
const v = await fetch(`${HUB}/api/auth/siwe/verify`, { method: "POST", headers: { "content-type": "application/json", origin: HUB, cookie: cookie() }, body: JSON.stringify({ message, signature, walletAddress: account.address, chainId }) })
keep(v)
console.log("verify", v.status, (await v.text()).slice(0, 200))
const s = await fetch(`${HUB}/api/auth/get-session`, { headers: { cookie: cookie(), origin: HUB } })
console.log("session", s.status, (await s.text()).slice(0, 300))
const f = await fetch(`${HUB}/api/faucet`, { headers: { cookie: cookie(), origin: HUB } })
console.log("faucet", f.status, (await f.text()).slice(0, 600))
if (process.argv[2]) writeFileSync(process.argv[2], cookie(), { mode: 0o600 })
