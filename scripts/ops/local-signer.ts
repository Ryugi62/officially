// Local SIWE-only signer for the Arkiv Hub faucet (TESTNET key from env, never sent anywhere).
// Signs nothing but a "hub.arkiv.network wants you to sign in" message for its own address; refuses everything else.
// Listens on 127.0.0.1 only and exits after 15 minutes.
import { createServer } from "node:http"
import { privateKeyToAccount } from "viem/accounts"

const account = privateKeyToAccount(process.env.SIGNER_KEY as `0x${string}`)
const PORT = Number(process.env.SIGNER_PORT ?? 47811)
const ORIGIN = "https://hub.arkiv.network"
const cors = { "access-control-allow-origin": ORIGIN, "access-control-allow-methods": "POST, GET, OPTIONS", "access-control-allow-headers": "content-type", "access-control-allow-private-network": "true" }
const srv = createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end() }
  if (req.method === "GET" && req.url === "/address") { res.writeHead(200, { ...cors, "content-type": "application/json" }); return res.end(JSON.stringify({ address: account.address })) }
  if (req.method === "POST" && req.url === "/sign") {
    let body = ""
    for await (const c of req) body += c
    const { message } = JSON.parse(body) as { message: string }
    const ok = typeof message === "string" && message.startsWith("hub.arkiv.network wants you to sign in with your Ethereum account:\n" + account.address + "\n") && message.includes("\nChain ID: 7738577\n")
    console.log(new Date().toISOString(), "sign request", ok ? "SIWE for hub.arkiv.network — signed" : "REFUSED")
    if (!ok) { res.writeHead(403, cors); return res.end("refused") }
    res.writeHead(200, { ...cors, "content-type": "application/json" })
    return res.end(JSON.stringify({ signature: await account.signMessage({ message }) }))
  }
  res.writeHead(404, cors); res.end()
})
srv.listen(PORT, "127.0.0.1", () => console.log("signer for", account.address, "on 127.0.0.1:" + PORT))
setTimeout(() => { console.log("timeout, exiting"); process.exit(0) }, 15 * 60 * 1000)
